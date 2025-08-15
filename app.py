from flask import Flask, request, jsonify, send_file, render_template, send_from_directory
import os
import zipfile
import json
import shutil
import tempfile
from werkzeug.utils import secure_filename
import xml.etree.ElementTree as ET
from xml.dom import minidom
import uuid

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
os.makedirs('static/images', exist_ok=True)
os.makedirs('static/annotations', exist_ok=True)

# Global variables to store current session data
current_session = {
    'images': [],
    'annotations': {},
    'class_labels': [],
    'session_id': None
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.zip'):
        return jsonify({'error': 'Please upload a ZIP file'}), 400
    
    # Generate unique session ID
    session_id = str(uuid.uuid4())
    session_folder = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    os.makedirs(session_folder, exist_ok=True)
    
    # Save uploaded file
    zip_path = os.path.join(session_folder, secure_filename(file.filename))
    file.save(zip_path)
    
    # Extract images
    images = []
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            for file_info in zip_ref.filelist:
                if file_info.filename.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.gif')):
                    # Extract to static/images for web access
                    zip_ref.extract(file_info, 'static/images')
                    images.append(file_info.filename)
    except Exception as e:
        return jsonify({'error': f'Error extracting ZIP file: {str(e)}'}), 400
    
    # Update global session
    current_session['images'] = images
    current_session['annotations'] = {}
    current_session['session_id'] = session_id
    
    return jsonify({
        'success': True,
        'images': images,
        'session_id': session_id,
        'total_images': len(images)
    })

@app.route('/upload_classes', methods=['POST'])
def upload_classes():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.txt'):
        return jsonify({'error': 'Please upload a TXT file'}), 400
    
    try:
        content = file.read().decode('utf-8')
        class_labels = [line.strip() for line in content.split('\n') if line.strip()]
        current_session['class_labels'] = class_labels
        return jsonify({'success': True, 'class_labels': class_labels})
    except Exception as e:
        return jsonify({'error': f'Error reading class file: {str(e)}'}), 400

@app.route('/save_annotation', methods=['POST'])
def save_annotation():
    data = request.json
    image_name = data.get('image_name')
    annotations = data.get('annotations', [])
    
    if not image_name:
        return jsonify({'error': 'Image name is required'}), 400
    
    current_session['annotations'][image_name] = annotations
    return jsonify({'success': True})

@app.route('/get_annotations/<image_name>')
def get_annotations(image_name):
    annotations = current_session['annotations'].get(image_name, [])
    return jsonify({'annotations': annotations})

@app.route('/export_voc', methods=['POST'])
def export_voc():
    try:
        # Create temporary directory for export
        export_dir = tempfile.mkdtemp()
        
        for image_name, annotations in current_session['annotations'].items():
            if not annotations:
                continue
                
            # Create XML file for each image
            xml_content = create_voc_xml(image_name, annotations)
            xml_filename = os.path.splitext(image_name)[0] + '.xml'
            xml_path = os.path.join(export_dir, xml_filename)
            
            with open(xml_path, 'w', encoding='utf-8') as f:
                f.write(xml_content)
        
        # Create ZIP file
        zip_path = os.path.join(export_dir, 'annotations.zip')
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for root, dirs, files in os.walk(export_dir):
                for file in files:
                    if file.endswith('.xml'):
                        file_path = os.path.join(root, file)
                        zipf.write(file_path, file)
        
        return send_file(zip_path, as_attachment=True, download_name='annotations.zip')
    
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
    path.text = f'static/images/{image_name}'
    
    # Add source
    source = ET.SubElement(root, 'source')
    database = ET.SubElement(source, 'database')
    database.text = 'Unknown'
    
    # Add size (you might want to get actual image dimensions)
    size = ET.SubElement(root, 'size')
    width = ET.SubElement(size, 'width')
    width.text = '800'  # Default, should be actual image width
    height = ET.SubElement(size, 'height')
    height.text = '600'  # Default, should be actual image height
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


@app.route('/static/images/<path:filename>')
def serve_image(filename):
    return send_from_directory('static/images', filename)


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 

# For Vercel deployment
app = app

