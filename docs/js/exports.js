/* Exportação de relatórios em CSV e PDF (gerados no navegador a partir dos dados do banco) */
(function () {
  'use strict';
  const fmt = (v, type) => {
    if (v === null || v === undefined) return '';
    if (type === 'money') return (Number(v) / 100).toFixed(2).replace('.', ',');
    if (type === 'datetime') return v ? new Date(v).toLocaleString('pt-BR') : '';
    return String(v);
  };
  const fmtView = (v, type) => (type === 'money' ? CB.brl(v) : fmt(v, type));
  const fileName = (r, ext) => `cardoso-${r.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${CB.todayKey()}.${ext}`;

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  }

  CB.exportCSV = function (r) {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [
      q(`Cardoso Baterias — ${r.title}`),
      q(`Período: ${r.period}`),
      q(`Gerado em: ${new Date().toLocaleString('pt-BR')} — dados demonstrativos`),
      '',
      r.columns.map((c) => q(c.label)).join(';'),
      ...r.rows.map((row) => r.columns.map((c) => q(fmt(row[c.key], c.type))).join(';')),
      '',
      ...r.summary.map((s) => `${q(s.label)};${q(fmt(s.value, s.type))}`),
    ];
    const name = fileName(r, 'csv');
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), name);
    return name;
  };

  let pdfLoaded = null;
  const load = (src) =>
    new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => fail(new Error('Falha ao carregar o gerador de PDF.'));
      document.head.appendChild(s);
    });

  CB.exportPDF = async function (r) {
    pdfLoaded = pdfLoaded || load(CB.BASE + 'vendor/jspdf.umd.min.js' + CB.vq).then(() => load(CB.BASE + 'vendor/jspdf.plugin.autotable.min.js' + CB.vq));
    await pdfLoaded;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    doc.setFillColor(13, 13, 13);
    doc.rect(0, 0, W, 64, 'F');
    doc.setFillColor(255, 196, 0);
    doc.rect(0, 64, W, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(20);
    doc.text('CARDOSO', 30, 34);
    doc.setTextColor(255, 196, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('B A T E R I A S', 32, 50);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(r.title, W - 30, 32, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Período: ${r.period}  ·  Gerado em ${new Date().toLocaleString('pt-BR')}`, W - 30, 50, { align: 'right' });
    doc.setTextColor(20, 20, 20);
    let y = 90;
    doc.setFontSize(9);
    doc.setTextColor(154, 98, 0);
    doc.text('Dados demonstrativos — Cardoso Baterias (apresentação comercial)', 30, y);
    doc.setTextColor(20, 20, 20);
    y += 14;
    const sumText = r.summary.map((s) => `${s.label}: ${fmtView(s.value, s.type)}`).join('   |   ');
    doc.setFont('helvetica', 'bold');
    const split = doc.splitTextToSize(sumText, W - 60);
    doc.text(split, 30, y + 6);
    y += 14 * split.length + 6;
    doc.autoTable({
      startY: y,
      head: [r.columns.map((c) => c.label)],
      body: r.rows.map((row) => r.columns.map((c) => fmtView(row[c.key], c.type))),
      styles: { fontSize: 7.5, cellPadding: 3 },
      headStyles: { fillColor: [13, 13, 13], textColor: [255, 196, 0] },
      alternateRowStyles: { fillColor: [247, 247, 245] },
      columnStyles: Object.fromEntries(r.columns.map((c, i) => [i, ['money', 'int'].includes(c.type) ? { halign: 'right' } : {}])),
      margin: { left: 30, right: 30 },
      didDrawPage: () => {
        const p = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Página ${p}`, W - 30, doc.internal.pageSize.getHeight() - 14, { align: 'right' });
      },
    });
    if (!r.rows.length) doc.text('Nenhum registro no período.', 30, y + 40);
    const name = fileName(r, 'pdf');
    doc.save(name);
    return name;
  };
  CB.fmtReport = fmtView;
})();
