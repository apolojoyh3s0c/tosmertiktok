from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from datetime import datetime
import cloudinary
import cloudinary.uploader

app = Flask(__name__)
CORS(app)

# Configure Cloudinary from environment variables
cloudinary.config(
    cloud_name=os.environ.get('CLOUDINARY_CLOUD_NAME'),
    api_key=os.environ.get('CLOUDINARY_API_KEY'),
    api_secret=os.environ.get('CLOUDINARY_API_SECRET')
)

@app.route('/')
def serve_html():
    return send_file('index.html')

@app.route('/style.css')
def serve_css():
    return send_file('style.css', mimetype='text/css')

@app.route('/script.js')
def serve_js():
    return send_file('script.js', mimetype='application/javascript')

@app.route('/config.json')
def serve_config():
    return send_file('config.json', mimetype='application/json')

@app.route('/cat-scuba-kicau.gif')
def serve_gif():
    return send_file('cat-scuba-kicau.gif', mimetype='image/gif')

@app.route('/upload', methods=['POST'])
def upload_video():
    try:
        if 'video' not in request.files:
            return jsonify({"success": False, "message": "No video file provided"}), 400
        
        video_file = request.files['video']
        
        if video_file.filename == '':
            return jsonify({"success": False, "message": "Empty filename"}), 400
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        filename = f"video_{timestamp}.webm"
        
        upload_result = cloudinary.uploader.upload(
            video_file,
            resource_type="video",
            folder="user_recordings",
            type="private",
            public_id=filename,
            use_filename=True,
            unique_filename=False
        )
        
        print(f"Video uploaded to Cloudinary: {upload_result['public_id']}")
        print(f"Video size: {upload_result.get('bytes', 0)} bytes")
        
        return jsonify({
            "success": True,
            "message": "Video saved privately to cloud storage",
            "public_id": upload_result['public_id'],
            "size_bytes": upload_result.get('bytes', 0),
            "timestamp": timestamp
        })
        
    except Exception as error:
        print(f"Upload error: {str(error)}")
        return jsonify({"success": False, "message": f"Upload failed: {str(error)}"}), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "ok",
        "service": "video-recorder",
        "timestamp": datetime.now().isoformat()
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 10000))
    app.run(host='0.0.0.0', port=port, debug=False)