// Attendance Kiosk Logic with Face Verification

// State
let selectedEmployeeId = null;
let selectedEmployeeName = null;
let stream = null;
let currentCode = '';
let referenceDescriptor = null;
const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';

// DOM Elements
const step1 = document.getElementById('step-1');
const step2 = document.getElementById('step-2');
const step3 = document.getElementById('step-3');
const stepSuccess = document.getElementById('step-success');

const dot1 = document.getElementById('dot-1');
const dot2 = document.getElementById('dot-2');
const dot3 = document.getElementById('dot-3');

const employeeSelect = document.getElementById('employee-select');
const codeInput = document.getElementById('daily-code');
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('photo-canvas');
const loader = document.getElementById('loader');
const statusBox = document.getElementById('status-box');

// Init
document.addEventListener('DOMContentLoaded', () => {
    fetchEmployees();
});

// 1. Fetch Employees
async function fetchEmployees() {
    if (!window.supabaseClient) {
        showError('System Error: Supabase client not found.');
        return;
    }

    const { data, error } = await window.supabaseClient
        .from('attendance_employees')
        .select('id, name, photo_url')
        .eq('status', 'Active')
        .order('name');

    if (error) {
        showError('Failed to load employees. Please refresh.');
        console.error(error);
        return;
    }

    employeeSelect.innerHTML = '<option value="">Select Your Name</option>' +
        data.map(emp => `<option value="${emp.id}" data-photo="${emp.photo_url || ''}">${emp.name}</option>`).join('');
}

// Navigation
function goToStep2() {
    const empId = employeeSelect.value;
    if (!empId) {
        showError('Please select your name first.');
        return;
    }
    selectedEmployeeId = empId;
    selectedEmployeeName = employeeSelect.options[employeeSelect.selectedIndex].text;

    showStep(2);
    clearError();
}

function showStep(stepNum) {
    step1.classList.remove('active');
    step2.classList.remove('active');
    step3.classList.remove('active');
    stepSuccess.classList.remove('active');

    if (stepNum === 1) step1.classList.add('active');
    if (stepNum === 2) step2.classList.add('active');
    if (stepNum === 3) step3.classList.add('active');
    if (stepNum === 4) stepSuccess.classList.add('active');

    dot1.classList.toggle('active', stepNum >= 1);
    dot2.classList.toggle('active', stepNum >= 2);
    dot3.classList.toggle('active', stepNum >= 3);
}

function prevStep(target) {
    if (target === 1) {
        showStep(1);
        stopCamera();
    }
    if (target === 2) {
        showStep(2);
        stopCamera();
    }
}

// 2. Verify Code
async function verifyCodeAndStartCamera() {
    const code = codeInput.value.trim();
    if (!code) {
        showError('Please enter the daily code.');
        return;
    }

    showLoader(true);

    const { data: isValid, error } = await window.supabaseClient
        .rpc('verify_daily_code', { input_code: code });

    showLoader(false);

    if (error) {
        console.error(error);
        showError('System verification failed.');
        return;
    }

    if (isValid) {
        currentCode = code;
        startCamera();
        showStep(3);
    } else {
        showError('Invalid Daily Code. Please check with admin.');
    }
}

// 3. Face Verification & Camera
async function loadModels() {
    updateStatus('Loading AI System...');
    try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
        updateStatus('');
        return true;
    } catch (e) {
        console.error(e);
        showError('Failed to load AI Models. Check internet.');
        return false;
    }
}

async function startCamera() {
    clearError();

    // Checks & Model Load
    if (!faceapi.nets.ssdMobilenetv1.params) {
        const loaded = await loadModels();
        if (!loaded) return;
    }

    // Load Reference Face
    const option = employeeSelect.options[employeeSelect.selectedIndex];
    const photoUrl = option.getAttribute('data-photo');

    if (!photoUrl || photoUrl === 'null' || photoUrl === '') {
        showError('Authentication Failed: No profile photo found for this employee.');
        return;
    }

    updateStatus('Analyzing Profile Photo...');
    try {
        // Fetch and Detect
        const img = await faceapi.fetchImage(photoUrl);
        const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            updateStatus('');
            showError('Could not detect a face in your registered profile photo.');
            return;
        }
        referenceDescriptor = detection.descriptor;
        updateStatus('');

    } catch (err) {
        console.error(err);
        showError('Error processing profile photo. ' + (err.message || ''));
        updateStatus('');
        return;
    }

    try {
        const constraints = { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        document.querySelector('.camera-container').style.display = 'block';
    } catch (err) {
        console.error(err);
        showError('Unable to access camera.');
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

// 4. Capture & Verify
async function captureAndSubmit() {
    if (!stream || !referenceDescriptor) {
        showError('System not ready. Please wait.');
        return;
    }

    updateStatus('Verifying Face...');

    // Detect Live Face
    const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

    if (!detection) {
        showError('No face detected. Look at the camera.');
        updateStatus('');
        return;
    }

    // Compare
    const distance = faceapi.euclideanDistance(referenceDescriptor, detection.descriptor);
    // Threshold: 0.6 is standard
    const THRESHOLD = 0.6;

    console.log(`Face Distance: ${distance}`); // Lower = Better Match

    if (distance > THRESHOLD) {
        showError('Verification Failed. Face does not match.');
        updateStatus('');
        return;
    }

    // Match Success
    // updateStatus('Verified! Saving...');

    const employeeId = employeeSelect.value;
    const employeeName = employeeSelect.options[employeeSelect.selectedIndex].text;

    const { error } = await window.supabaseClient
        .from('attendance_logs')
        .insert([{
            employee_id: employeeId,
            employee_name: employeeName,
            verification_method: 'Face Verified',
            selfie_url: null, // Per user request: Don't store
            match_score: distance,
            status: 'Verified',
            check_in_time: new Date()
        }]);

    if (error) {
        console.error(error);
        showError('Failed to log attendance.');
        updateStatus('');
    } else {
        updateStatus('');
        document.getElementById('success-name').innerText = selectedEmployeeName;
        showStep(4);
        setTimeout(resetKiosk, 3000);
    }
}

function resetKiosk() {
    employeeSelect.value = '';
    codeInput.value = '';
    selectedEmployeeId = null;
    selectedEmployeeName = null;
    currentCode = '';
    referenceDescriptor = null; // Clear reference

    clearError();
    showStep(1);
    fetchEmployees();
}

// Utilities
function showError(msg) {
    statusBox.innerText = msg;
    statusBox.classList.remove('success');
    statusBox.style.display = 'block';
    statusBox.style.color = ''; // Reset color
    setTimeout(() => {
        statusBox.style.display = 'none';
    }, 5000);
}

function clearError() {
    statusBox.style.display = 'none';
    statusBox.innerText = '';
}

function updateStatus(msg) {
    if (msg) {
        statusBox.innerText = msg;
        statusBox.style.display = 'block';
        statusBox.style.color = 'blue';
    } else {
        statusBox.style.display = 'none';
        statusBox.style.color = '';
    }
}

function showLoader(show) {
    loader.style.display = show ? 'flex' : 'none';
}
