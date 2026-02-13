#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Email Parser Utilities"""

import re
import json
import uuid
import os
import imaplib
from email.header import decode_header
from config import INLINE_IMAGES_DIR


def decode_text(header_value):
    if not header_value:
        return ''
    try:
        decoded_parts = decode_header(header_value)
        text_parts = []
        for part, encoding in decoded_parts:
            if isinstance(part, bytes):
                try:
                    if encoding:
                        text = part.decode(encoding)
                    else:
                        text = part.decode('utf-8', errors='ignore')
                except:
                    text = part.decode('gbk', errors='ignore')
            else:
                text = str(part)
            text_parts.append(text)
        return ''.join(text_parts).strip()
    except Exception:
        return str(header_value)


def extract_original_sender(text_body, default_sender):
    if not text_body:
        return default_sender
    
    patterns = [
        r"From:\s*([^\n\r]+)",
        r"发件人[:：]\s*([^\n\r]+)",
        r"-----Original Message-----.*?From:\s*([^\n\r]+)"
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text_body, re.IGNORECASE | re.DOTALL)
        if match:
            raw_extracted = match.group(1).strip()
            clean_match = re.sub(r'<.*?>', '', raw_extracted)
            return f"{clean_match} (via {default_sender})"
    
    return default_sender


def detect_image_extension(data):
    if not data or len(data) < 8:
        return 'png'
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    elif data[:2] == b'\xff\xd8':
        return 'jpg'
    elif data[:6] in (b'GIF87a', b'GIF89a'):
        return 'gif'
    elif data[:4] == b'RIFF' and len(data) > 12 and data[8:12] == b'WEBP':
        return 'webp'
    return 'png'


def get_imap_connection(account):
    import ssl
    context = ssl.create_default_context()
    try:
        if account['imap_port'] == 993:
            conn = imaplib.IMAP4_SSL(account['imap_host'], account['imap_port'], ssl_context=context)
        else:
            conn = imaplib.IMAP4(account['imap_host'], account['imap_port'])
        conn.login(account['username'], account['password'])
        
        host_str = account.get('imap_host', '').lower()
        is_netease = any(d in host_str for d in ['163.com', '126.com', '188.com', 'yeah.net'])
        
        if is_netease or account.get('provider') in ['163', '126', '188']:
            try:
                imaplib.Commands['ID'] = ('AUTH', 'SELECTED')
                args = ("name", "DeskMate", "version", "1.0.0", "vendor", "DeskMate", "contact", "support@deskmate.local")
                typ, dat = conn._simple_command('ID', '("' + '" "'.join(args) + '")')
                print(f"[IMAP] ID命令结果: {typ}")
            except Exception as e:
                print(f"[IMAP] ID命令失败(非致命): {e}")
        
        return conn
    except Exception as e:
        print(f"[IMAP] 连接失败: {e}")
        raise e


def parse_email_content(msg, msg_uuid):
    body = ''
    body_html = ''
    attachments = []
    inline_images = {}

    def parse_part(part):
        nonlocal body, body_html, attachments, inline_images
        try:
            content_type = part.get_content_type()
            content_disposition = str(part.get('Content-Disposition', ''))
            content_id = part.get('Content-ID', '')

            filename = part.get_filename()
            if filename:
                filename = decode_text(filename)

            payload = part.get_payload(decode=True)
            
            if not content_type.startswith('text/'):
                print(f"[调试] 非文本部分: type={content_type}, cid={content_id}, filename={filename}, disposition={content_disposition}")
            
            image_extensions = ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')
            is_image = content_type.startswith('image/') or (filename and filename.lower().endswith(image_extensions))
            
            if is_image:
                if content_id:
                    cid = content_id.strip('<>')
                    actual_type = content_type
                    if filename:
                        ext = filename.lower().rsplit('.', 1)[-1]
                        type_map = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'webp': 'image/webp', 'bmp': 'image/bmp'}
                        if ext in type_map:
                            actual_type = type_map[ext]
                    inline_images[cid] = {
                        'filename': filename or f"image_{len(inline_images) + 1}",
                        'content_type': actual_type,
                        'data': payload,
                        'size': len(payload) if payload else 0
                    }
                    print(f"[调试] 添加内嵌图片(CID): {cid}")
                    return
                elif 'inline' in content_disposition.lower():
                    if filename:
                        inline_images[filename] = {
                            'filename': filename,
                            'content_type': content_type,
                            'data': payload,
                            'size': len(payload) if payload else 0
                        }
                        print(f"[调试] 添加内嵌图片(inline): {filename}")
                        return
                elif filename and 'attachment' not in content_disposition.lower():
                    inline_images[filename] = {
                        'filename': filename,
                        'content_type': content_type,
                        'data': payload,
                        'size': len(payload) if payload else 0
                    }
                    print(f"[调试] 添加内嵌图片(文件名): {filename}")
                    return

            if filename or 'attachment' in content_disposition.lower():
                if not filename:
                    filename = "unknown_file"
                attachments.append({
                    'id': str(uuid.uuid4()),
                    'filename': filename,
                    'size': len(payload) if payload else 0,
                    'content_type': content_type,
                    'data': payload
                })
                return

            if content_type == 'text/html' or content_type == 'text/plain':
                try:
                    charset = part.get_content_charset() or 'utf-8'
                    content = payload.decode(charset, errors='ignore')
                except:
                    content = str(part.get_payload())

                if content_type == 'text/html':
                    body_html += content
                elif content_type == 'text/plain':
                    body += content
        except Exception as e:
            print(f"[邮件解析] 解析部分失败: {e}")

    def walk_parts(msg_part):
        if msg_part.is_multipart():
            for sub_part in msg_part.get_payload():
                walk_parts(sub_part)
        else:
            parse_part(msg_part)

    walk_parts(msg)

    print(f"[调试] 内嵌图片数量: {len(inline_images)}, keys: {list(inline_images.keys())}")
    for cid, img_info in inline_images.items():
        if img_info['data']:
            ext = detect_image_extension(img_info['data'])
            safe_cid = re.sub(r'[<>:"/\\|?*]', '_', cid)
            filename = f"{msg_uuid}_{safe_cid}.{ext}"
            filepath = os.path.join(INLINE_IMAGES_DIR, filename)
            
            with open(filepath, 'wb') as f:
                f.write(img_info['data'])
            
            img_url = f"http://127.0.0.1:5000/api/email/inline-images/{filename}"
            print(f"[调试] 替换 CID: {cid} -> {img_url}")
            body_html = body_html.replace(f'cid:{cid}', img_url)
            body_html = body_html.replace(f'src="cid:{cid}"', f'src="{img_url}"')
            body_html = body_html.replace(f"src='cid:{cid}'", f"src='{img_url}'")
    
    remaining_cids = re.findall(r'cid:([^"\'\s>]+)', body_html)
    if remaining_cids:
        print(f"[调试] 未替换的 CID: {remaining_cids}")
        for remaining_cid in remaining_cids:
            for stored_cid, img_info in inline_images.items():
                if remaining_cid.lower() in stored_cid.lower() or stored_cid.lower() in remaining_cid.lower():
                    ext = detect_image_extension(img_info['data'])
                    safe_cid = re.sub(r'[<>:"/\\|?*]', '_', stored_cid)
                    filename = f"{msg_uuid}_{safe_cid}.{ext}"
                    filepath = os.path.join(INLINE_IMAGES_DIR, filename)
                    
                    with open(filepath, 'wb') as f:
                        f.write(img_info['data'])
                    
                    img_url = f"http://127.0.0.1:5000/api/email/inline-images/{filename}"
                    body_html = body_html.replace(f'cid:{remaining_cid}', img_url)
                    break

    return body, body_html, attachments
