import fitz
import os

doc = fitz.open("SIGA_Portfolio_Servicos.pdf")
print(f"Total de páginas: {doc.page_count}")
print(f"Metadata: {doc.metadata}")

os.makedirs(".agents/outputs/portfolio", exist_ok=True)

for i in range(doc.page_count):
    page = doc[i]
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
    out = f".agents/outputs/portfolio/page_{i+1:02d}.png"
    pix.save(out)
    print(f"Página {i+1} guardada: {out}")

doc.close()
print("Concluído.")
