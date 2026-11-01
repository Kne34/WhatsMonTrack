const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 });

export const formatIDR = (value: number) => idr.format(value);
