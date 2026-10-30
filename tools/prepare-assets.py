"""Режет портреты коллег и собирает логотип Smilex. Запуск: python tools/prepare-assets.py SRC_DIR"""
import sys, os
from PIL import Image

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'people')
# id: (файл, (left, top, right, bottom))
CROPS = {
    'ivan':    ('1.webp', (572, 150, 1012, 590)),
    'alesya':  ('1.webp', (327, 400, 787, 860)),
    'marina':  ('2.webp', (475, 360, 945, 830)),
    'alla':    ('5.webp', (80, 130, 440, 490)),
    'pasha':   ('6.webp', (0, 280, 460, 740)),
    'artem':   ('3.webp', (106, 370, 626, 890)),
    'ksyusha': ('4.png',  (120, 60, 500, 440)),
}
os.makedirs(OUT, exist_ok=True)
for pid, (f, box) in CROPS.items():
    im = Image.open(os.path.join(SRC, f)).convert('RGB').crop(box).resize((400, 400), Image.LANCZOS)
    im.save(os.path.join(OUT, pid + '.webp'), quality=88)
print('ok')

# --- логотип: Sminex -> Smilex (n заменяется на l, штрих берётся из буквы i) ---
import numpy as np
src = Image.open(os.path.join(SRC, '7.png')).convert('L')
a = np.array(src)
top, bot = 340, 605
white = np.full_like(a, 255)
head = a[top:bot, 66:595]                         # S m i
istem = a[421:596, 549:594]                       # тело i
fill = np.repeat(a[450:451, 549:594], 71, axis=0)
lstem = np.vstack([a[421:441, 549:594], fill, a[441:596, 549:594]])   # высота 246 -> до верха S
tail = a[top:bot, 816:1137]                       # e x
shift = 54
x = 66 + shift
white[top:bot, x:x + head.shape[1]] = head
x += head.shape[1] + (637 - 595)
white[350:350 + lstem.shape[0], x:x + 45] = lstem
x += 45 + (816 - 791) + 12
white[top:bot, x:x + tail.shape[1]] = tail
white[640:, :] = a[640:, :]                       # подпись без изменений
Image.fromarray(white).save(os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui', 'logo-smilex.png'))

# узкая версия логотипа для шапки (обрезка по содержимому)
logo = Image.open(os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui', 'logo-smilex.png')).convert('L')
box = Image.eval(logo, lambda p: 255 - p).getbbox()
logo.crop((box[0] - 10, box[1] - 10, box[2] + 10, box[3] + 10)).save(os.path.join(os.path.dirname(__file__), '..', 'assets', 'ui', 'logo-smilex-wide.png'))
