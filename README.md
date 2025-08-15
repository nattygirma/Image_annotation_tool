# Object Detection Annotation Tool

A web-based tool for manually annotating bounding boxes for object detection tasks. This tool allows users to upload images, draw bounding boxes, assign class labels, and export annotations in Pascal VOC XML format.


## Installation

### Prerequisites
- Python 3.7 or higher
- pip (Python package installer)

### Setup Instructions

1. **Clone or download the project files**

2. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the application:**
   ```bash
   python app.py
   ```

4. **Open your web browser and navigate to:**
   ```
   http://localhost:5000
   ```

## Usage Guide

### Step 1: Prepare Your Files

1. **Images**: Create a ZIP file containing all images you want to annotate
   - Supported formats: JPG, JPEG, PNG, BMP, GIF
   - Images should be in the root of the ZIP file (not in subfolders)

2. **Class Labels (Optional)**: Create a TXT file with class names
   - One class name per line
   - Example:
     ```
     person
     car
     dog
     cat
     ```

### Step 2: Upload Files

1. **Upload Images**: Click "Choose ZIP File" and select your image ZIP file
2. **Upload Classes (Optional)**: Click "Choose TXT File" and select your class labels file

### Step 3: Annotate Images

1. **Set Class Label**: Enter a class name in the text box or select from dropdown
2. **Draw Bounding Box**: Click and drag on the image to create a bounding box
3. **Review**: The box will appear with a red border and semi-transparent fill
4. **Add More Boxes**: Repeat for additional objects in the same image
5. **Navigate**: Use Previous/Next buttons or dropdown to move between images

### Step 4: Save and Export

1. **Save Progress**: Click "Save Annotations" to save current image annotations
2. **Export**: Click "Export Annotations" to download all annotations as a ZIP file
