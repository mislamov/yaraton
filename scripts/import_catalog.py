"""Import confirmed products and photos from the public Google Form."""
import concurrent.futures
import json
import re
import urllib.request
import urllib.error
import urllib.parse
import io
import time
from pathlib import Path
from bs4 import BeautifulSoup
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfhEpVE2OAboDvlqyLiq9zHBH21oMfBPYNaQIJ7zUUQ2_YqEg/viewform'


def fetch(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        return response.read()


def main():
    first = fetch(URL)
    soup = BeautifulSoup(first, 'html.parser')
    navigation = {field['name']: field.get('value', '') for field in soup.select('input[type=hidden]')}
    # Only navigate to section two; never submit the form or place an order.
    navigation.update({'continue': '1', 'entry.444161761': '—', 'entry.1479708264': '—', 'entry.1678720132': '—', 'entry.135770292': 'с 12:00 - 16:00'})
    with urllib.request.urlopen(URL.replace('viewform', 'formResponse'), data=urllib.parse.urlencode(navigation).encode(), timeout=45) as response:
        second = response.read()
    pages = [first, second]
    data = json.loads(re.search(r'FB_PUBLIC_LOAD_DATA_\s*=\s*(.*?);\s*</script>', pages[0].decode(), re.S)[1])
    photos = {}
    for page in pages:
        soup = BeautifulSoup(page, 'html.parser')
        for image in soup.select('img.HxhGpf'):
            parent = image.find_parent(attrs={'data-params': True})
            if parent:
                match = re.match(r'%\.@\.\[(\d+),', parent['data-params'])
                if match:
                    photos[int(match[1])] = image['src']
            else:
                group = image.find_parent(attrs={'data-item-id': True})
                if group:
                    photos[int(group['data-item-id'])] = image['src']
    products = []
    group_photo = None
    for question in data[1][1]:
        ident, title, _, kind = question[:4]
        if kind == 11:
            group_photo = photos.get(ident)
        match = re.search(r'(\d+[,.]?\d*\s*(?:кг|гр\.?|литра))\s*\.?\s*/\s*(\d+)\s*руб', title, re.I)
        if kind != 2 or not match:
            continue
        name = re.sub(r'\s+', ' ', title[:match.start()]).strip(' .').replace('"', '')
        name = re.sub(r'\s+hit$', '', name, flags=re.I)
        low = name.lower()
        if low.startswith('пельмени'):
            category = 'Пельмени'
        elif low.startswith('вареники'):
            category = 'Вареники'
        elif low.startswith(('блины', 'блинчики', 'чебуреки', 'курники')):
            category = 'Блины и выпечка'
        elif low.startswith('молоко'):
            category = 'Молочные продукты'
        elif low.startswith(('манты', 'хинкали')):
            category = 'Манты и хинкали'
        else:
            category = 'Мясные блюда'
        remainder = title[match.end():].strip(' .\n')
        fallback = photos.get(1481964025) if name == 'Котлеты Фитнес' else group_photo
        products.append(dict(id=str(ident), name=name, price=int(match[2]), weight=re.sub(r'\s+', ' ', match[1]), category=category, description=re.sub(r'\s+', ' ', remainder), photoSource=photos.get(ident) or fallback))

    # Shared photos in the source illustrate a group, not a specific variant.
    unique = {p['photoSource'] for p in products if p['photoSource']}
    paths = {url: f'images/product-{i+1:02}.jpg' for i, url in enumerate(sorted(unique))}
    def download_once(url):
        # Google's crop suffix is malformed for some source images; retain resize only.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        try:
            response = urllib.request.build_opener(NoRedirect).open(url, timeout=45)
            content = response.read()
        except urllib.error.HTTPError as error:
            if error.code != 302:
                raise
            target = error.headers['Location'].split('=w')[0] + '=w900'
            content = fetch(target)
        assert content[:2] == b'\xff\xd8' or content[:4] in (b'\x89PNG', b'RIFF'), 'Unexpected photo format'
        image = Image.open(io.BytesIO(content)).convert('RGB')
        image.thumbnail((1000, 1000))
        image.save(ROOT / 'public' / paths[url], quality=86, optimize=True)
    def download(url):
        for attempt in range(4):
            try:
                return download_once(url)
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                if attempt == 3:
                    raise
                time.sleep(1 + attempt * 2)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        list(pool.map(download, unique))
    for product in products:
        product['image'] = paths[product.pop('photoSource')]
    (ROOT / 'public' / 'products.json').write_text(json.dumps(products, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(products)} products, {len(unique)} local photographs.')


if __name__ == '__main__':
    main()
