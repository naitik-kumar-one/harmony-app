// HARMONY AI - Fixed & Cleaned v1.3
const fileInput = document.getElementById('imageUpload');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const metricsDiv = document.getElementById('metrics');
const scorecard = document.getElementById('scorecard');
const loading = document.getElementById('loading');

// 1. Setup MediaPipe FaceMesh
const faceMesh = new FaceMesh({locateFile: (file) => {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});

faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true, 
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onResults);

// 2. Handle Image Upload
fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = async () => {
    // Resize canvas to match image
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    
    // Show loading state
    if(loading) loading.style.display = 'block';
    if(scorecard) scorecard.style.display = 'none';
    if(metricsDiv) metricsDiv.innerHTML = ""; 
    
    // Run the AI
    await faceMesh.send({image: img});
  };
});

// 3. Geometry Math Helper Functions
function getDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function calculateAngle(A, B, C) {
    if(!A || !B || !C) return 0;
    const AB = Math.sqrt(Math.pow(B.x - A.x, 2) + Math.pow(B.y - A.y, 2));
    const BC = Math.sqrt(Math.pow(B.x - C.x, 2) + Math.pow(B.y - C.y, 2));
    const AC = Math.sqrt(Math.pow(C.x - A.x, 2) + Math.pow(C.y - A.y, 2));
    if (BC * AB === 0) return 0;
    let angleRad = Math.acos((BC*BC + AB*AB - AC*AC) / (2*BC*AB));
    return angleRad * (180 / Math.PI); 
}

function getTierClass(tier) {
    if (!tier) return "tier-f";
    if (tier.includes("Tier S")) return "tier-s";
    if (tier.includes("Tier A")) return "tier-a";
    if (tier.includes("Tier B")) return "tier-b";
    return "tier-f";
}

// 4. THE BRAIN: Process the measurements
function onResults(results) {
  // Hide loading, show results box
  if(loading) loading.style.display = 'none';
  if(scorecard) scorecard.style.display = 'block';
  
  // Safety check: Did we find a face?
  if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      metricsDiv.innerHTML = "<span style='color:red'>No face detected. Please try a clearer photo.</span>";
      return;
  }

  const landmarks = results.multiFaceLandmarks[0];

  // Draw the mesh
  try {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height); // Redraw image so mesh sits on top
      if (window.drawConnectors) {
          drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, {color: '#C0C0C040', lineWidth: 0.5});
      }
      ctx.restore();
  } catch(e) {
      console.log("Visual mesh error (ignoring): " + e);
  }

  // START CALCULATION (Wrapped in try/catch to prevent blank screen)
  try {
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    
    // Calculate Face Width
    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    
    let html = "";
    
    // --- SIDE PROFILE LOGIC ---
    // If face is very narrow (width < 0.2) or nose is outside the cheeks
    if (faceWidth < 0.2 || nose.x < leftCheek.x || nose.x > rightCheek.x) {
        
        let profileSide = "Right";
        let earIdx = 132, jawIdx = 172, chinIdx = 152; 

        if (nose.x < 0.5) { 
            profileSide = "Left";
            earIdx = 361; jawIdx = 397; chinIdx = 152; 
        }

        const ear = landmarks[earIdx];
        const jaw = landmarks[jawIdx]; 
        const chin = landmarks[chinIdx];

        // 1. Gonial Angle
        let gonialAngle = calculateAngle(ear, jaw, chin);
        if (isNaN(gonialAngle)) gonialAngle = 0;
        
        let jawTier = "Tier F";
        if (gonialAngle >= 110 && gonialAngle <= 125) jawTier = "Tier S (Ideal)";
        else if (gonialAngle >= 105 && gonialAngle <= 130) jawTier = "Tier A";
        else if (gonialAngle > 90 && gonialAngle < 140) jawTier = "Tier B";

        html += `<h4>${profileSide} Profile Detected</h4>`;
        html += `<p><strong>Gonial Angle:</strong> ${gonialAngle.toFixed(1)}° <span class="${getTierClass(jawTier)}">[${jawTier}]</span></p>`;
        
        // 2. Ramus Ratio
        const ramus = getDistance(ear, jaw);
        const mandible = getDistance(jaw, chin);
        let ratio = ramus / mandible;
        if (isNaN(ratio) || !isFinite(ratio)) ratio = 0;
        
        let ratioTier = "Tier F";
        if (ratio >= 0.55 && ratio <= 0.80) ratioTier = "Tier S (Ideal)";
        else if (ratio >= 0.45 && ratio <= 0.90) ratioTier = "Tier A";

        html += `<p><strong>Ramus Ratio:</strong> ${ratio.toFixed(2)} <span class="${getTierClass(ratioTier)}">[${ratioTier}]</span></p>`;

    } else {
        // --- FRONT PROFILE LOGIC ---
        html += `<h4>Front Profile Detected</h4>`;

        // 1. Canthal Tilt
        const outerEye = landmarks[33];
        const innerEye = landmarks[133];
        let tilt = (Math.atan2(outerEye.y - innerEye.y, outerEye.x - innerEye.x) * 180 / Math.PI) * -1;
        
        let tiltTier = "Tier B";
        if (tilt >= 4 && tilt <= 10) tiltTier = "Tier S (Ideal)";
        else if (tilt > 0) tiltTier = "Tier A (Positive)";
        else tiltTier = "Tier F (Negative)";
        
        html += `<p><strong>Canthal Tilt:</strong> ${tilt.toFixed(1)}° <span class="${getTierClass(tiltTier)}">[${tiltTier}]</span></p>`;

        // 2. Eye Separation
        const innerDist = getDistance(landmarks[133], landmarks[362]);
        const cheekWidth = getDistance(landmarks[234], landmarks[454]);
        let esr = (innerDist / cheekWidth) * 100;
        
        let esrTier = "Tier B";
        if (esr >= 45 && esr <= 47) esrTier = "Tier S (Ideal)";
        else if (esr >= 42 && esr <= 50) esrTier = "Tier A";
        
        html += `<p><strong>Eye Separation:</strong> ${esr.toFixed(1)}% <span class="${getTierClass(esrTier)}">[${esrTier}]</span></p>`;
    }

    metricsDiv.innerHTML = html;

  } catch (err) {
      console.error(err);
      metricsDiv.innerHTML = `<span style='color:red'>Calculation Error: ${err.message}</span>`;
  }
}
