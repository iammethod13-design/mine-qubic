# Icône de l'app à partir de la marque Qubic (brand kit qubic.org/brand-kit) :
# deux barres cyan #23FFFF sur fond #232429, géométrie mesurée sur le PNG officiel 1206x1206.
from PIL import Image, ImageDraw
S = 1206
def mark(size, bg=(35, 36, 41, 255), fg=(35, 255, 255, 255), radius_bg=0, transparent_bg=False):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if not transparent_bg:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=radius_bg, fill=bg)
    d.rounded_rectangle([351, 171, 565, 820], radius=22, fill=fg)
    d.rounded_rectangle([639, 171, 856, 1036], radius=22, fill=fg)
    return im.resize((size, size), Image.LANCZOS)
mark(512, radius_bg=int(S * 0.19)).save("assets/icon.png")
mark(256, radius_bg=int(S * 0.19)).save("assets/icon-256.png")
mark(64, transparent_bg=True).save("assets/tray.png")
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}">
  <rect x="351" y="171" width="214" height="649" rx="22" fill="#23FFFF"/>
  <rect x="639" y="171" width="217" height="865" rx="22" fill="#23FFFF"/>
</svg>'''
open("assets/qubic-mark.svg", "w").write(svg)
print("ok")
