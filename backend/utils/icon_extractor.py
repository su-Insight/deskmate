#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Icon Extraction Utilities"""

import re
import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse


def extract_icons(target_url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        parsed = urlparse(target_url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"

        response = httpx.get(base_url, headers=headers, timeout=10, follow_redirects=True)
        response.raise_for_status()
        html_content = response.text

        soup = BeautifulSoup(html_content, 'html.parser')
        icons = []

        for link in soup.find_all('link'):
            rel = link.get('rel')
            href = link.get('href')

            if not rel or not href:
                continue

            if isinstance(rel, str):
                rel = rel.split()

            rel_lower = [r.lower() for r in rel]

            if 'icon' in rel_lower or 'apple-touch-icon' in rel_lower:
                if href.startswith('http://') or href.startswith('https://'):
                    final_url = href
                elif href.startswith('//'):
                    final_url = 'https:' + href
                else:
                    cur_url = response.url
                    final_url = urljoin(str(cur_url), href)

                icons.append({
                    'type': link.get('type', 'unknown'),
                    'sizes': link.get('sizes', 'any'),
                    'url': final_url
                })

        return icons

    except Exception as e:
        print(f"解析图标出错: {e}")
        return []


def score_icon(icon_data):
    score = 0
    url = icon_data['url'].lower()
    rel = str(icon_data.get('rel', '')).lower()
    size_str = str(icon_data.get('sizes', 'any')).lower()

    if 'apple-touch-icon' in rel:
        score += 100
    elif 'manifest' in rel:
        score += 90
    elif 'fluid-icon' in rel:
        score += 80
    elif 'mask-icon' in rel:
        score += 70

    sizes = re.findall(r'\d+', size_str)
    if sizes:
        width = int(sizes[0])
        if 120 <= width <= 256:
            score += 50
        elif width > 256:
            score += 40
        elif width < 64:
            score -= 20

    if url.endswith('.svg'):
        score += 60
    elif url.endswith('.png'):
        score += 30
    elif url.endswith('.ico'):
        score += 10

    return score


def select_best_icon(icon_list):
    if not icon_list:
        return None
    sorted_icons = sorted(icon_list, key=score_icon, reverse=True)
    return sorted_icons[0]
