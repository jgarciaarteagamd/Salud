# Reduce los dibujos a 512 px y paleta de 96 colores (son ilustraciones planas). Uso: python3 scripts/optimize-images.py
import glob
from PIL import Image
for p in glob.glob('app/img/ex/*.png'):
    im = Image.open(p)
    if im.width <= 512: continue
    im = im.convert('RGB').resize((512, 512), Image.LANCZOS).quantize(colors=96, method=Image.Quantize.MEDIANCUT)
    im.save(p, optimize=True)
