-- Investasi page: holdings, their buy/sell history, and the last known market prices
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT,
    "coingeckoId" TEXT,
    "platform" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" DECIMAL(30,10) NOT NULL,
    "avgPrice" DECIMAL(30,10) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestmentTrade" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" DECIMAL(30,10) NOT NULL,
    "price" DECIMAL(30,10) NOT NULL,
    "realizedPnl" DECIMAL(30,10),
    "note" TEXT,
    "tradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentTrade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MarketPrice" (
    "key" TEXT NOT NULL,
    "price" DECIMAL(30,10) NOT NULL,
    "currency" TEXT NOT NULL,
    "priceIdr" DECIMAL(30,10),
    "name" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "Investment_userId_idx" ON "Investment"("userId");
CREATE INDEX "InvestmentTrade_investmentId_tradedAt_idx" ON "InvestmentTrade"("investmentId", "tradedAt");

ALTER TABLE "Investment" ADD CONSTRAINT "Investment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentTrade" ADD CONSTRAINT "InvestmentTrade_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
