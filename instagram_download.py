import sys
import json
import os
from instagrapi import Client
from instagrapi.exceptions import LoginRequired, ClientError

def download_video(url, output_path, username, password):
    try:
        cl = Client()
        cl.login(username, password)
        
        # Extract shortcode from URL
        shortcode = url.split('/')[-2]
        media = cl.media_info(cl.media_pk_from_code(shortcode))
        
        if media.media_type == 2:  # Video
            # Ensure output directory exists
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            # Download video
            cl.video_download(media.pk, folder=os.path.dirname(output_path), filename=os.path.basename(output_path))
            return {'success': True, 'filePath': output_path}
        else:
            return {'success': False, 'error': 'No video found in Instagram post'}
            
    except (LoginRequired, ClientError) as e:
        return {'success': False, 'error': str(e)}
    except Exception as e:
        return {'success': False, 'error': f'Unexpected error: {str(e)}'}

if __name__ == '__main__':
    url = sys.argv[1]
    output_path = sys.argv[2]
    username = sys.argv[3]
    password = sys.argv[4]
    
    result = download_video(url, output_path, username, password)
    print(json.dumps(result))