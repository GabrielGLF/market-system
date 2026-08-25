import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Sale } from '../types';
import { formatCurrency, formatDateTime } from './format';

export const generateSalesPdf = (sales: Sale[], periodInfo: string) => {
  const doc = new jsPDF();

  // Cabeçalho Elegante
  doc.setFillColor(5, 150, 105); // emerald-600
  doc.rect(0, 0, 210, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('MARKETSYSTEM — RELATÓRIO EXECUTIVO DE VENDAS', 14, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')} | Filtro: ${periodInfo.toUpperCase()}`, 14, 22);

  // Resumo
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumo do Período Selecionado', 14, 38);

  const completedSales = sales.filter(s => s.status === 'COMPLETED');
  const totalFaturado = completedSales.reduce((acc, sale) => acc + sale.total, 0);
  const totalLucro = completedSales.reduce((acc, sale) => acc + (sale.profit || 0), 0);
  const ticketMedio = completedSales.length > 0 ? totalFaturado / completedSales.length : 0;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total de Vendas Concluídas: ${completedSales.length}`, 14, 45);
  doc.text(`Faturamento Bruto: ${formatCurrency(totalFaturado)}`, 80, 45);
  doc.text(`Lucro Bruto Apurado: ${formatCurrency(totalLucro)}`, 145, 45);
  doc.text(`Ticket Médio: ${formatCurrency(ticketMedio)}`, 14, 51);
  doc.text(`Vendas Canceladas: ${sales.filter(s => s.status === 'CANCELLED').length}`, 80, 51);

  // Tabela
  const tableData = sales.map(s => [
    `#${s.saleNumber}`,
    formatDateTime(s.date),
    s.customerName || 'Consumidor Final',
    s.items.length.toString(),
    s.paymentMethods.map(m => m.method).join(', '),
    s.status === 'COMPLETED' ? 'Concluída' : s.status === 'CANCELLED' ? 'Cancelada' : s.status,
    formatCurrency(s.total)
  ]);

  autoTable(doc, {
    startY: 57,
    head: [['Cupom', 'Data e Hora', 'Cliente', 'Itens', 'Forma Pagto', 'Status', 'Total']],
    body: tableData,
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { 
      fillColor: [5, 150, 105],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    }
  });

  doc.save(`relatorio-vendas-marketsystem-${new Date().toISOString().slice(0, 10)}.pdf`);
};

export default generateSalesPdf;
