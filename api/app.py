from flask import Flask, request, jsonify, render_template_string
import os
import zipfile
import json
import tempfile
from werkzeug.utils import secure_filename
import xml.etree.ElementTree as ET
from xml.dom import minidom
import uuid
import base64
import io

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024  # 4MB for Vercel

# In-memory storage for Vercel (since file system is read-only)
sessions = {}

# HTML template (inline since templates folder might not work)
HTML_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AStar Image Annotation Tool</title>
    <style>
        /* Your existing CSS here - simplified for Vercel */
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        canvas { border: 1px solid #ccc; }
        button { padding: 10px 20px; margin: 5px; }
        .upload-section { margin-bottom: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>AStar - Object Detection Annotation Tool</h1>
        
        <div class="upload-section">
            <h3>Upload Images (ZIP file)</h3>
            <input type="file" id="imageUpload" accept=".zip">
            <button onclick="uploadImages()">Upload Images</button>
            
            <h3>Upload Classes (TXT file - Optional)</h3>
            <input type="file" id="classUpload" accept=".txt">
            <button onclick="uploadClasses()">Upload Classes</button>
        </div>
        
        <div id="annotation-area" style="display:none;">
            <canvas id="annotationCanvas" width="800" height="600"></canvas>
            <div>
                <input type="text" id="classLabel" placeholder="Enter class name">
                <button onclick="saveAnnotations()">Save Annotations</button>
                <button onclick="exportAnnotations()">Export Pascal VOC</button>
            </div>
        </div>
    </div>
    
    <script>
        // Simplified JavaScript for basic functionality
        let images = [];
        let annotations = {};
        let sessionId = '';
        
        async function uploadImages() {
            const fileInput = document.getElementById('imageUpload');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a ZIP file');
                return;
            }
            
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (result.success) {
                    images = result.images;
                    sessionId = result.session_id;
                    document.getElementById('annotation-area').style.display = 'block';
                    alert(`Successfully uploaded ${result.total_images} images`);
                } else {
                    alert('Error: ' + result.error);
                }
            } catch (error) {
                alert('Upload failed: ' + error.message);
            }
        }
        
        async function saveAnnotations() {
            alert('Annotations saved in memory');
        }
        
        async function exportAnnotations() {
            try {
                const response = await fetch('/api/export_voc', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        session_id: sessionId,
                        annotations: annotations
                    })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'annotations.zip';
                    a.click();
                } else {
                    alert('Export failed');
                }
            } catch (error) {
                alert('Export error: ' + error.message);
            }
        }
    </script>
</body>
</html>'''

@app.route('/')
def index():
    return HTML_TEMPLATE

@app.route('/api/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.endswith('.zip'):
            return jsonify({'error': 'Please upload a ZIP file'}), 400
        
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        
        # Read ZIP file in memory
        zip_data = file.read()
        images = []
        
        # Process ZIP file in memory
        with zipfile.ZipFile(io.BytesIO(zip_data), 'r') as zip_ref:
            for file_info in zip_ref.filelist:
                if file_info.filename.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.gif')):
                    # Store image data in memory as base64
                    image_data = zip_ref.read(file_info)
                    image_b64 = base64.b64encode(image_data).decode('utf-8')
                    
                    images.append({
                        'name': file_info.filename,
                        'data': image_b64
                    })
        
        # Store session in memory
        sessions[session_id] = {
            'images': images,
            'annotations': {},
            'class_labels': []
        }
        
        return jsonify({
            'success': True,
            'images': [img['name'] for img in images],
            'session_id': session_id,
            'total_images': len(images)
        })
        
    except Exception as e:
        return jsonify({'error': f'Error processing ZIP file: {str(e)}'}), 400

@app.route('/api/export_voc', methods=['POST'])
def export_voc():
    try:
        data = request.json
        session_id = data.get('session_id')
        annotations = data.get('annotations', {})
        
        if session_id not in sessions:
            return jsonify({'error': 'Session not found'}), 404
        
        # Create temporary directory for export
        with tempfile.TemporaryDirectory() as export_dir:
            # Create XML files for annotations
            for image_name, image_annotations in annotations.items():
                if image_annotations:
                    xml_content = create_voc_xml(image_name, image_annotations)
                    xml_filename = os.path.splitext(image_name)[0] + '.xml'
                    xml_path = os.path.join(export_dir, xml_filename)
                    
                    with open(xml_path, 'w', encoding='utf-8') as f:
                        f.write(xml_content)
            
            # Create ZIP file in memory
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, 'w') as zipf:
                for root, dirs, files in os.walk(export_dir):
                    for file in files:
                        if file.endswith('.xml'):
                            file_path = os.path.join(root, file)
                            zipf.write(file_path, file)
            
            zip_buffer.seek(0)
            
            return send_file(
                io.BytesIO(zip_buffer.read()),
                as_attachment=True,
                download_name='annotations.zip',
                mimetype='application/zip'
            )
    
    except Exception as e:
        return jsonify({'error': f'Export failed: {str(e)}'}), 500

def create_voc_xml(image_name, annotations):
    """Create Pascal VOC XML format annotation"""
    root = ET.Element('annotation')
    
    # Add basic info
    folder = ET.SubElement(root, 'folder')
    folder.text = 'images'
    
    filename = ET.SubElement(root, 'filename')
    filename.text = image_name
    
    path = ET.SubElement(root, 'path')
    path.text = f'images/{image_name}'
    
    # Add source
    source = ET.SubElement(root, 'source')
    database = ET.SubElement(source, 'database')
    database.text = 'Unknown'
    
    # Add size
    size = ET.SubElement(root, 'size')
    width = ET.SubElement(size, 'width')
    width.text = '800'
    height = ET.SubElement(size, 'height')
    height.text = '600'
    depth = ET.SubElement(size, 'depth')
    depth.text = '3'
    
    # Add segmented
    segmented = ET.SubElement(root, 'segmented')
    segmented.text = '0'
    
    # Add objects
    for ann in annotations:
        obj = ET.SubElement(root, 'object')
        
        name = ET.SubElement(obj, 'name')
        name.text = ann['label']
        
        pose = ET.SubElement(obj, 'pose')
        pose.text = 'Unspecified'
        
        truncated = ET.SubElement(obj, 'truncated')
        truncated.text = '0'
        
        difficult = ET.SubElement(obj, 'difficult')
        difficult.text = '0'
        
        bndbox = ET.SubElement(obj, 'bndbox')
        xmin = ET.SubElement(bndbox, 'xmin')
        xmin.text = str(int(ann['x']))
        ymin = ET.SubElement(bndbox, 'ymin')
        ymin.text = str(int(ann['y']))
        xmax = ET.SubElement(bndbox, 'xmax')
        xmax.text = str(int(ann['x'] + ann['width']))
        ymax = ET.SubElement(bndbox, 'ymax')
        ymax.text = str(int(ann['y'] + ann['height']))
    
    # Pretty print XML
    rough_string = ET.tostring(root, 'unicode')
    reparsed = minidom.parseString(rough_string)
    return reparsed.toprettyxml(indent="  ")

# For Vercel
def handler(request):
    return app(request.environ, lambda status, headers: None)

if __name__ == '__main__':
    app.run(debug=True)