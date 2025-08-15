// Global variables
let canvas, ctx;
let currentImageIndex = 0;
let images = [];
let annotations = {};
let classLabels = [];
let isDrawing = false;
let startX, startY;
let currentBox = null;
let imageElement = null;
let classColors = {}; // Store colors for each class

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeCanvas();
    setupEventListeners();
});

function initializeCanvas() {
    canvas = document.getElementById('annotationCanvas');
    ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = 800;
    canvas.height = 600;
    
    // Set canvas style
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 0, 0, 0.1)';
}

// Generate a unique color for each class
function getClassColor(className) {
    if (!classColors[className]) {
        // Generate a color based on the class name hash
        let hash = 0;
        for (let i = 0; i < className.length; i++) {
            hash = className.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        // Convert hash to RGB values
        const r = Math.abs(hash) % 256;
        const g = Math.abs(hash >> 8) % 256;
        const b = Math.abs(hash >> 16) % 256;
        
        // Ensure good contrast by avoiding very light colors
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        if (brightness > 200) {
            // If too light, darken it
            classColors[className] = `rgb(${Math.max(0, r - 100)}, ${Math.max(0, g - 100)}, ${Math.max(0, b - 100)})`;
        } else {
            classColors[className] = `rgb(${r}, ${g}, ${b})`;
        }
    }
    return classColors[className];
}

// Get a lighter version of the color for fill
function getClassFillColor(className) {
    const color = getClassColor(className);
    const rgb = color.match(/\d+/g);
    if (rgb) {
        return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.2)`;
    }
    return 'rgba(255, 0, 0, 0.2)'; // fallback
}

// Helper function to convert screen coordinates to image coordinates
function screenToImageCoords(screenX, screenY) {
    const rect = canvas.getBoundingClientRect();
    
    // Calculate the actual displayed image dimensions
    const imageAspectRatio = imageElement.width / imageElement.height;
    const containerAspectRatio = rect.width / rect.height;
    
    let displayWidth, displayHeight, offsetX, offsetY;
    
    if (imageAspectRatio > containerAspectRatio) {
        displayWidth = rect.width;
        displayHeight = rect.width / imageAspectRatio;
        offsetX = 0;
        offsetY = (rect.height - displayHeight) / 2;
    } else {
        displayHeight = rect.height;
        displayWidth = rect.height * imageAspectRatio;
        offsetX = (rect.width - displayWidth) / 2;
        offsetY = 0;
    }
    
    const scaleX = imageElement.width / displayWidth;
    const scaleY = imageElement.height / displayHeight;
    
    const mouseX = screenX - rect.left;
    const mouseY = screenY - rect.top;
    
    const imageX = (mouseX - offsetX) * scaleX;
    const imageY = (mouseY - offsetY) * scaleY;
    
    return { x: imageX, y: imageY, inBounds: mouseX >= offsetX && mouseX <= offsetX + displayWidth && mouseY >= offsetY && mouseY <= offsetY + displayHeight };
}

// Update the visual indicator for the current class color
function updateClassColorIndicator() {
    const classLabel = document.getElementById('classLabel');
    const classDropdown = document.getElementById('classDropdown');
    const currentLabel = classLabel.value || classDropdown.value;
    
    if (currentLabel) {
        const color = getClassColor(currentLabel);
        classLabel.style.borderColor = color;
        classLabel.style.borderWidth = '2px';
        classDropdown.style.borderColor = color;
        classDropdown.style.borderWidth = '2px';
    } else {
        classLabel.style.borderColor = '#ced4da';
        classLabel.style.borderWidth = '1px';
        classDropdown.style.borderColor = '#ced4da';
        classDropdown.style.borderWidth = '1px';
    }
}

// Create a color legend for all classes
function createColorLegend() {
    const legendContainer = document.getElementById('colorLegend');
    if (!legendContainer) return;
    
    if (classLabels.length === 0) {
        legendContainer.innerHTML = '<p style="text-align: center; color: #6c757d; font-size: 0.9em;">No class labels loaded</p>';
        return;
    }
    
    legendContainer.innerHTML = '<h4 style="margin-bottom: 10px; color: #495057;">Class Colors:</h4>';
    
    classLabels.forEach(label => {
        const color = getClassColor(label);
        const legendItem = document.createElement('div');
        legendItem.style.cssText = `
            display: flex;
            align-items: center;
            margin-bottom: 5px;
            font-size: 0.9em;
        `;
        
        const colorBox = document.createElement('div');
        colorBox.style.cssText = `
            width: 12px;
            height: 12px;
            background-color: ${color};
            margin-right: 8px;
            border: 1px solid #ccc;
            border-radius: 2px;
        `;
        
        const labelText = document.createElement('span');
        labelText.textContent = label;
        labelText.style.color = color;
        labelText.style.fontWeight = 'bold';
        
        legendItem.appendChild(colorBox);
        legendItem.appendChild(labelText);
        legendContainer.appendChild(legendItem);
    });
}

function setupEventListeners() {
    // File upload listeners
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('classUpload').addEventListener('change', handleClassUpload);
    
    // Canvas event listeners
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDrawing);
    canvas.addEventListener('mouseleave', endDrawing);
    
    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', handleTouchEnd);
    
    // Class label input listeners
    document.getElementById('classLabel').addEventListener('input', function() {
        document.getElementById('classDropdown').value = '';
        updateClassColorIndicator();
    });
    
    document.getElementById('classDropdown').addEventListener('change', function() {
        document.getElementById('classLabel').value = this.value;
        updateClassColorIndicator();
    });
}

// File upload handlers
async function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            images = result.images;
            currentImageIndex = 0;
            annotations = {};
            
            updateStatus('imageStatus', `Successfully uploaded ${result.total_images} images`, 'success');
            showAnnotationSection();
            loadImage(0);
            updateProgress();
            populateImageSelect();
        } else {
            updateStatus('imageStatus', result.error, 'error');
        }
    } catch (error) {
        updateStatus('imageStatus', 'Upload failed: ' + error.message, 'error');
    }
}

async function handleClassUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/upload_classes', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            classLabels = result.class_labels;
            populateClassDropdown();
            createColorLegend();
            updateStatus('classStatus', `Loaded ${classLabels.length} class labels`, 'success');
        } else {
            updateStatus('classStatus', result.error, 'error');
        }
    } catch (error) {
        updateStatus('classStatus', 'Upload failed: ' + error.message, 'error');
    }
}

// Canvas drawing functions
function startDrawing(e) {
    e.preventDefault();
    const coords = screenToImageCoords(e.clientX, e.clientY);
    
    if (coords.inBounds) {
        startX = coords.x;
        startY = coords.y;
        isDrawing = true;
    }
}

function draw(e) {
    if (!isDrawing) return;
    
    e.preventDefault();
    const coords = screenToImageCoords(e.clientX, e.clientY);
    
    redrawCanvas();
    
    const width = coords.x - startX;
    const height = coords.y - startY;
    
    const currentLabel = document.getElementById('classLabel').value || document.getElementById('classDropdown').value;
    const strokeColor = currentLabel ? getClassColor(currentLabel) : '#ff0000';
    const fillColor = currentLabel ? getClassFillColor(currentLabel) : 'rgba(255, 0, 0, 0.1)';
    
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, width, height);
    
    ctx.fillStyle = fillColor;
    ctx.fillRect(startX, startY, width, height);
}

function endDrawing(e) {
    if (!isDrawing) return;
    
    e.preventDefault();
    isDrawing = false;
    
    const coords = screenToImageCoords(e.clientX, e.clientY);
    
    const width = coords.x - startX;
    const height = coords.y - startY;
    
    if (Math.abs(width) > 10 && Math.abs(height) > 10) {
        const label = document.getElementById('classLabel').value || document.getElementById('classDropdown').value;
        if (label) {
            addBoundingBox(startX, startY, width, height, label);
        } else {
            alert('Please enter a class label before drawing a bounding box.');
        }
    }
    
    redrawCanvas();
}

// Touch event handlers for mobile
function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    startDrawing(mouseEvent);
}

function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    draw(mouseEvent);
}

function handleTouchEnd(e) {
    e.preventDefault();
    const touch = e.changedTouches[0];
    const mouseEvent = new MouseEvent('mouseup', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    endDrawing(mouseEvent);
}

// Bounding box management
function addBoundingBox(x, y, width, height, label) {
    const currentImage = images[currentImageIndex];
    if (!annotations[currentImage]) {
        annotations[currentImage] = [];
    }
    
    const box = {
        x: Math.min(x, x + width),
        y: Math.min(y, y + height),
        width: Math.abs(width),
        height: Math.abs(height),
        label: label
    };
    
    annotations[currentImage].push(box);
    updateAnnotationsList();
}

function removeBoundingBox(index) {
    const currentImage = images[currentImageIndex];
    if (annotations[currentImage]) {
        annotations[currentImage].splice(index, 1);
        updateAnnotationsList();
        redrawCanvas();
    }
}

function undoLastBox() {
    const currentImage = images[currentImageIndex];
    if (annotations[currentImage] && annotations[currentImage].length > 0) {
        annotations[currentImage].pop();
        updateAnnotationsList();
        redrawCanvas();
    }
}

// Canvas redrawing
function redrawCanvas() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (imageElement) {
        ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    }
    
    const currentImage = images[currentImageIndex];
    if (annotations[currentImage]) {
        annotations[currentImage].forEach((box, index) => {
            const strokeColor = getClassColor(box.label);
            const fillColor = getClassFillColor(box.label);
            
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            
            ctx.fillStyle = fillColor;
            ctx.fillRect(box.x, box.y, box.width, box.height);
            
            const labelText = box.label;
            const labelWidth = ctx.measureText(labelText).width;
            const labelHeight = 16;
            
            ctx.fillStyle = strokeColor;
            ctx.fillRect(box.x, box.y - labelHeight - 2, labelWidth + 4, labelHeight);
            
            // Draw label text
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px Arial';
            ctx.fillText(labelText, box.x + 2, box.y - 5);
        });
    }
}

// Image loading and navigation
function loadImage(index) {
    if (index < 0 || index >= images.length) return;
    
    currentImageIndex = index;
    const imageName = images[index];
    
    imageElement = new Image();
    imageElement.onload = function() {
        // Set canvas size to match image dimensions
        canvas.width = imageElement.width;
        canvas.height = imageElement.height;
        
        // Clear canvas and draw image at original size
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
        
        // Load existing annotations
        loadAnnotations();
        redrawCanvas();
    };
    
    imageElement.src = `/static/images/${imageName}`;
    updateCurrentImageDisplay();
}

async function loadAnnotations() {
    const currentImage = images[currentImageIndex];
    try {
        const response = await fetch(`/get_annotations/${encodeURIComponent(currentImage)}`);
        const result = await response.json();
        if (result.annotations) {
            annotations[currentImage] = result.annotations;
            updateAnnotationsList();
        }
    } catch (error) {
        console.error('Error loading annotations:', error);
    }
}

function nextImage() {
    if (currentImageIndex < images.length - 1) {
        saveCurrentAnnotations();
        loadImage(currentImageIndex + 1);
        updateProgress();
    }
}

function previousImage() {
    if (currentImageIndex > 0) {
        saveCurrentAnnotations();
        loadImage(currentImageIndex - 1);
        updateProgress();
    }
}

function jumpToImage() {
    const select = document.getElementById('imageSelect');
    const newIndex = parseInt(select.value);
    if (newIndex !== currentImageIndex) {
        saveCurrentAnnotations();
        loadImage(newIndex);
        updateProgress();
    }
}

// UI updates
function showAnnotationSection() {
    document.getElementById('annotationSection').style.display = 'block';
    document.getElementById('exportSection').style.display = 'block';
}

function updateCurrentImageDisplay() {
    const currentImage = images[currentImageIndex];
    document.getElementById('currentImage').textContent = `Image ${currentImageIndex + 1} of ${images.length}`;
}

function updateProgress() {
    const annotatedCount = Object.keys(annotations).filter(img => 
        annotations[img] && annotations[img].length > 0
    ).length;
    const progress = (annotatedCount / images.length) * 100;
    
    document.getElementById('progressFill').style.width = `${progress}%`;
    document.getElementById('progressText').textContent = `${Math.round(progress)}%`;
}

function populateImageSelect() {
    const select = document.getElementById('imageSelect');
    select.innerHTML = '';
    
    images.forEach((image, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = `${index + 1}. ${image}`;
        select.appendChild(option);
    });
}

function populateClassDropdown() {
    const select = document.getElementById('classDropdown');
    select.innerHTML = '<option value="">Select class...</option>';
    
    classLabels.forEach(label => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        option.style.color = getClassColor(label);
        select.appendChild(option);
    });
}

function updateAnnotationsList() {
    const list = document.getElementById('annotationsList');
    const currentImage = images[currentImageIndex];
    const currentAnnotations = annotations[currentImage] || [];
    
    if (currentAnnotations.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #6c757d;">No annotations yet</p>';
        return;
    }
    
    list.innerHTML = '';
    currentAnnotations.forEach((box, index) => {
        const color = getClassColor(box.label);
        const item = document.createElement('div');
        item.className = 'annotation-item';
        item.innerHTML = `
            <div class="annotation-info">
                <div class="annotation-label" style="color: ${color}; font-weight: bold;">${box.label}</div>
                <div class="annotation-coords">(${Math.round(box.x)}, ${Math.round(box.y)}) - ${Math.round(box.width)}×${Math.round(box.height)}</div>
            </div>
            <button class="btn btn-danger" onclick="removeBoundingBox(${index})">Delete</button>
        `;
        list.appendChild(item);
    });
}

function updateStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status ${type}`;
    element.style.display = 'block';
    
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// Save and export functions
function saveCurrentAnnotations() {
    const currentImage = images[currentImageIndex];
    if (annotations[currentImage]) {
        saveAnnotations();
    }
}

async function saveAnnotations() {
    const currentImage = images[currentImageIndex];
    const currentAnnotations = annotations[currentImage] || [];
    
    try {
        const response = await fetch('/save_annotation', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_name: currentImage,
                annotations: currentAnnotations
            })
        });
        
        const result = await response.json();
        if (result.success) {
            console.log('Annotations saved successfully');
        } else {
            console.error('Failed to save annotations:', result.error);
        }
    } catch (error) {
        console.error('Error saving annotations:', error);
    }
}

function clearCanvas() {
    const currentImage = images[currentImageIndex];
    if (annotations[currentImage]) {
        annotations[currentImage] = [];
        updateAnnotationsList();
        redrawCanvas();
    }
}

async function exportAnnotations() {
    try {
        const response = await fetch('/export_voc', {
            method: 'POST'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'annotations.zip';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } else {
            const result = await response.json();
            alert('Export failed: ' + result.error);
        }
    } catch (error) {
        alert('Export failed: ' + error.message);
    }
} 