"""Exporta a prévia PDF com os slides já renderizados pelo gerador JavaScript.

Dependência: reportlab. A edição dos objetos permanece no PowerPoint.
Uso: python docs/apresentacao-fluxos/exportar-pdf.py
"""
from pathlib import Path
import json
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

out = Path(__file__).resolve().parent
build = out.parents[1] / ".local" / "deck-build"
manifest = json.loads((build / "slides-manifest.json").read_text(encoding="utf-8"))
target = out / "Apresentacao_Fluxos_Projeto.pdf"
pdf = canvas.Canvas(str(target), pagesize=(1200, 675), pageCompression=1)
pdf.setTitle("Portal interno Ápice — Jornadas e funcionamento do sistema")
pdf.setAuthor("Ápice Contábil")
pdf.setSubject("Telas reais do protótipo com resumos breves e fluxo de mudança de regime")
for item in manifest:
    image = build / "renders" / f"slide-{item['slide']:02d}.png"
    if not image.is_file():
        raise FileNotFoundError(image)
    pdf.drawImage(ImageReader(str(image)), 0, 0, width=1200, height=675)
    pdf.bookmarkPage(f"slide-{item['slide']}")
    pdf.addOutlineEntry(item["title"], f"slide-{item['slide']}", 0)
    pdf.showPage()
pdf.save()
print(f"PDF_OK {len(manifest)} páginas")
