import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateInvestmentDto, CreateTradeDto, UpdateInvestmentDto } from './investments.dto';
import { MarketService, SymbolNotFoundError, sourceFor, type ChartInterval } from './market.service';
import { applyBuy, applySell, normalizeSymbol, SellTooLargeError, type AssetType, type Currency } from './portfolio';

const NOT_FOUND = 'Aset tidak ditemukan';

type Row = Record<string, unknown>;
/** DECIMAL columns come back as Prisma Decimal objects; the API speaks plain numbers. */
const num = (v: unknown) => (v == null ? null : Number(v));

function toHolding(r: Row & { quantity: unknown; avgPrice: unknown; assetType: string; symbol: string; coingeckoId: string | null }) {
  return { ...r, quantity: Number(r.quantity), avgPrice: Number(r.avgPrice), priceKey: sourceFor(r.assetType, r.symbol, r.coingeckoId).key };
}

function toTrade(r: Row & { quantity: unknown; price: unknown; realizedPnl: unknown }) {
  return { ...r, quantity: Number(r.quantity), price: Number(r.price), realizedPnl: num(r.realizedPnl) };
}

/** Investasi page: holdings per platform and their buy/sell history. Never touches accounts or balances. */
@Injectable()
export class InvestmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly market: MarketService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.investment.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(toHolding);
  }

  /** Live prices for the user's own holdings (plus USD/IDR). Only their tickers, so this is no open proxy. */
  async prices(userId: string) {
    const rows = await this.prisma.investment.findMany({ where: { userId }, select: { assetType: true, symbol: true, coingeckoId: true } });
    const { prices, fx, unreachable } = await this.market.quotes(rows.map((r) => sourceFor(r.assetType, r.symbol, r.coingeckoId)));
    return { prices, fx, unreachable, fetchedAt: new Date().toISOString() };
  }

  /** Price history of one of the user's holdings, for the chart */
  async chart(userId: string, id: string, interval: ChartInterval) {
    const row = await this.own(userId, id);
    const chart = await this.market.chart(sourceFor(row.assetType, row.symbol, row.coingeckoId), interval);
    return chart ?? { currency: row.assetType === 'IDX_STOCK' ? 'IDR' : 'USD', candles: [], source: null };
  }

  /** Key facts about one of the user's holdings for the chart page */
  async profile(userId: string, id: string) {
    const row = await this.own(userId, id);
    return this.market.profile(sourceFor(row.assetType, row.symbol, row.coingeckoId));
  }

  async create(userId: string, dto: CreateInvestmentDto) {
    const type = dto.assetType;
    const symbol = normalizeSymbol(type, dto.symbol);
    if (!symbol) throw new BadRequestException('Ticker wajib diisi.');
    const platform = dto.platform.trim();
    if (!platform) throw new BadRequestException('Platform wajib diisi.');
    checkLots(type, dto.quantity);
    const currency: Currency = type === 'IDX_STOCK' ? 'IDR' : (dto.currency ?? 'USD');

    const existing = await this.prisma.investment.findFirst({
      where: { userId, assetType: type, symbol, platform: { equals: platform, mode: 'insensitive' } },
    });
    if (existing) throw new ConflictException(`${symbol} di ${existing.platform} sudah ada. Pakai "Beli" untuk menambah jumlahnya.`);

    // Check the ticker and fill in the name. An unreachable source doesn't block saving.
    let name = dto.name?.trim() || null;
    let coingeckoId = dto.coingeckoId || null;
    if (!name || (type === 'CRYPTO' && !coingeckoId)) {
      try {
        const found = await this.market.lookup(type, symbol);
        name = name || found?.name || null;
        coingeckoId = coingeckoId || found?.coingeckoId || null;
      } catch (e) {
        if (e instanceof SymbolNotFoundError) throw new BadRequestException(notFoundMessage(type, symbol));
        throw e;
      }
    }

    const boughtAt = dto.boughtAt ? new Date(dto.boughtAt) : new Date();
    const row = await this.prisma.investment.create({
      data: {
        userId,
        assetType: type,
        symbol,
        name,
        coingeckoId: type === 'CRYPTO' ? coingeckoId : null,
        platform,
        currency,
        quantity: dto.quantity,
        avgPrice: dto.avgPrice,
        note: dto.note?.trim() || null,
        // The starting position is the first entry of the history
        trades: { create: { side: 'BUY', quantity: dto.quantity, price: dto.avgPrice, tradedAt: boughtAt, note: 'Posisi awal' } },
      },
    });
    return toHolding(row);
  }

  /** Direct corrections (e.g. to match the app). Buys/sells go through addTrade. */
  async update(userId: string, id: string, dto: UpdateInvestmentDto) {
    const row = await this.own(userId, id);
    if (dto.platform !== undefined && !dto.platform.trim()) throw new BadRequestException('Platform wajib diisi.');
    if (dto.quantity !== undefined) checkLots(row.assetType as AssetType, dto.quantity);
    const updated = await this.prisma.investment.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name.trim() || null : undefined,
        platform: dto.platform?.trim(),
        currency: row.assetType === 'IDX_STOCK' ? 'IDR' : dto.currency,
        quantity: dto.quantity,
        avgPrice: dto.avgPrice,
        coingeckoId: row.assetType === 'CRYPTO' && dto.coingeckoId ? dto.coingeckoId : undefined,
        note: dto.note !== undefined ? dto.note.trim() || null : undefined,
      },
    });
    return toHolding(updated);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.investment.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException(NOT_FOUND);
    return { success: true };
  }

  async trades(userId: string, id: string) {
    await this.own(userId, id);
    const rows = await this.prisma.investmentTrade.findMany({ where: { investmentId: id }, orderBy: [{ tradedAt: 'desc' }, { createdAt: 'desc' }] });
    return rows.map(toTrade);
  }

  /** A buy recomputes the average price; a sell lowers the quantity and records the realized P&L. */
  async addTrade(userId: string, id: string, dto: CreateTradeDto) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.investment.findFirst({ where: { id, userId } });
      if (!row) throw new NotFoundException(NOT_FOUND);
      checkLots(row.assetType as AssetType, dto.quantity);
      const quantity = Number(row.quantity);
      const avgPrice = Number(row.avgPrice);

      let next: { quantity: number; avgPrice: number; realizedPnl?: number };
      if (dto.side === 'BUY') {
        next = applyBuy(quantity, avgPrice, dto.quantity, dto.price);
      } else {
        try {
          next = applySell(row.assetType, quantity, avgPrice, dto.quantity, dto.price);
        } catch (e) {
          if (e instanceof SellTooLargeError) throw new BadRequestException(`Jumlah jual melebihi yang dimiliki (${quantity}).`);
          throw e;
        }
      }

      const trade = await tx.investmentTrade.create({
        data: {
          investmentId: id,
          side: dto.side,
          quantity: dto.quantity,
          price: dto.price,
          realizedPnl: next.realizedPnl ?? null,
          tradedAt: dto.tradedAt ? new Date(dto.tradedAt) : new Date(),
          note: dto.note?.trim() || null,
        },
      });
      const holding = await tx.investment.update({ where: { id }, data: { quantity: next.quantity, avgPrice: next.avgPrice } });
      return { holding: toHolding(holding), trade: toTrade(trade) };
    });
  }

  private async own(userId: string, id: string) {
    const row = await this.prisma.investment.findFirst({ where: { id, userId } });
    // 404 (not 403) so ids of other users cannot be probed
    if (!row) throw new NotFoundException(NOT_FOUND);
    return row;
  }
}

/** IDX stocks trade in whole lots */
function checkLots(type: AssetType, quantity: number) {
  if (type === 'IDX_STOCK' && !Number.isInteger(quantity)) {
    throw new BadRequestException('Saham Indonesia dihitung dalam lot (bilangan bulat, 1 lot = 100 lembar).');
  }
}

function notFoundMessage(type: AssetType, symbol: string) {
  if (type === 'IDX_STOCK') return `Ticker ${symbol} tidak ditemukan di Bursa Efek Indonesia.`;
  if (type === 'US_STOCK') return `Ticker ${symbol} tidak ditemukan di bursa AS.`;
  return `Koin ${symbol} tidak ditemukan di CoinGecko. Isi ID CoinGecko-nya secara manual.`;
}
