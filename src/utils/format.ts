export function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(val);
}

export function formatDate(date: string | Date): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(new Date(date));
}

export function formatNumber(val: number, maxFractions = 3): string {
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: maxFractions
  }).format(val);
}

export function formatDocument(doc: string): string {
  const digits = doc.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  } else if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return doc;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  } else if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }
  return phone;
}
