/*************** CDN loaders ***************/
async function loadScript(url){
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = res;
    s.onerror = () => rej(new Error('Failed '+url));
    document.head.appendChild(s);
  });
}

// ✅ MediaPipe-only loader (no TFJS model wrappers)
async function loadMediapipeOnly(){
  const verMPPose = '0.5';
  const verMPHands = '0.4.1675469240';
  await loadScript(`https://cdn.jsdelivr.net/npm/@mediapipe/pose@${verMPPose}/pose.js`);
  await loadScript(`https://cdn.jsdelivr.net/npm/@mediapipe/hands@${verMPHands}/hands.min.js`);
  await loadScript(`https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/face_mesh.js`);
}
/*************** Reusable Week Config (schema + Week 1 example) ***************/
/*
WEEK_CONFIG schema (minimal core widgets)
{
  week: 1,
  title: "Week 1 — Intro & SDLC",
  missions: [
    { id:"A", title:"SDLC Phase Sort", type:"cardBin",
      bins:["Planning","Analysis","Design","Implementation","Maintenance"],
      cards:[ {id:"c1", text:"Build a work plan", bin:"Planning"}, ... ] },
    { id:"B", title:"Feasibility Triad + MCQ", type:"multi",
      blocks:[
        { subtype:"triadBins", bins:["Economic","Technical","Operational"], cards:[...] },
        { subtype:"mcq", stem:"Which is a nonfunctional requirement?", options:[...], answer:2 }
      ] },
    { id:"C", title:"Requirements Quick Clinic", type:"cardBin",
      bins:["Functional","Nonfunctional","Constraint"], cards:[ ... ] }
  ],
  weights:{ A:3.5, B:3.0, C:3.5 } // points per mission (total ≈10)
}
*/

let WEEK_CONFIG = {
  week: 1,
  title: "Week 1 — Intro to Systems Analysis & SDLC",
  missions: [
    { id:"A", title:"SDLC Phase Sort", type:"cardBin",
      bins:["Planning","Analysis","Design","Implementation","Maintenance"],
      cards:[
        {id:"c1", text:"Identify and select projects", bin:"Planning"},
        {id:"c2", text:"Define system requirements", bin:"Analysis"},
        {id:"c3", text:"Create architecture & detailed specs", bin:"Design"},
        {id:"c4", text:"Write code / configure / test", bin:"Implementation"},
        {id:"c5", text:"Post-implementation support & updates", bin:"Maintenance"},
        {id:"c6", text:"Develop workplan and staffing", bin:"Planning"},
        {id:"c7", text:"Model current vs. proposed process", bin:"Analysis"}
      ]
    },
    { id:"B", title:"Feasibility Triad + Lifecycle Model MCQ", type:"multi",
      blocks:[
        { subtype:"triadBins", bins:["Economic","Technical","Operational"], cards:[
            {id:"f1", text:"ROI depends on reduced data entry costs", bin:"Economic"},
            {id:"f2", text:"New tech has unproven library support", bin:"Technical"},
            {id:"f3", text:"Clerks can learn new UI in a day", bin:"Operational"},
            {id:"f4", text:"Server capacity might be insufficient", bin:"Technical"}
        ]},
        { subtype:"mcq", stem:"Which lifecycle best fits evolving requirements?",
          options:["Waterfall","Spiral","Agile/Iterative"], answer:2 }
      ]
    },
    { id:"C", title:"Requirements Quick Clinic", type:"cardBin",
      bins:["Functional","Nonfunctional","Constraint"],
      cards:[
        {id:"r1", text:"System shall allow students to list textbooks", bin:"Functional"},
        {id:"r2", text:"Pages must load under 2 seconds", bin:"Nonfunctional"},
        {id:"r3", text:"Must use university SSO", bin:"Constraint"},
        {id:"r4", text:"Notify seller when a buyer messages", bin:"Functional"},
        {id:"r5", text:"Comply with FERPA", bin:"Constraint"}
      ]
    }
  ],
  weights:{ A:3.5, B:3.0, C:3.5 }
};

/*************** State + utils ***************/
const state={ participant:Math.random().toString(36).slice(2,10), mode:'idle', missionIdx:-1, events:[], lastTs:performance.now(), anchor:{x:0,y:0,s:300,ok:false}, lastPoseTs:0, hand:{x:0,y:0,visible:false,pinch:false, dragEl:null}, scores:{}, showShoulderFigures:false };
const $=s=>document.querySelector(s);
function log(action,payload={}){const now=performance.now(); const mis = (state.missionIdx>=0? WEEK_CONFIG.missions[state.missionIdx].id : 'onboarding'); state.events.push({participant_id:state.participant, condition:state.mode, mission:mis, action, payload, timestamp_ms:Date.now(), latency_ms:Math.round(now-state.lastTs)}); state.lastTs=now;}
function swapScreens(id){['#screenOnboarding','#screenMission','#screenWrap'].forEach(sel=>$(sel).classList.add('hidden')); $(id).classList.remove('hidden');}

/*************** Pose + Hands ***************/
const trkLabel=$('#trk'), hud=$('#hud'), cursorDot=$('#cursorDot'), leftShoulderFigure=$('#leftShoulderFigure'), rightShoulderFigure=$('#rightShoulderFigure'), btnToggleShoulders=$('#btnToggleShoulders');
let poseDetector=null, handDetector=null

let mpPose = null, mpHands = null, mpFaceMesh = null;
let poseRes = null, handsRes = null;
let videoStream = null, rafId = null, running = false;
let faceRes=null, SNAP=false;  // Face landmarks + one-shot “snap” recenter


// [!MODIFIED]
async function startCamera(){
  try {
    trkLabel.textContent = 'loading mediapipe…';
    await loadMediapipeOnly();

    const v = document.getElementById('video');
    videoStream = await navigator.mediaDevices.getUserMedia({
      video:{ facingMode:'user', width:{ideal:1280}, height:{ideal:720} },
      audio:false
    });
    v.srcObject = videoStream;
    v.muted = true;
    await v.play();
    v.classList.remove('hidden');

    // Instantiate Pose
    const PoseClass = (window.Pose && window.Pose.Pose) ? window.Pose.Pose : window.Pose;
    if (!PoseClass) throw new Error('MediaPipe Pose not loaded');
    mpPose = new PoseClass({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5/${f}`
    });
    mpPose.setOptions({
      modelComplexity: 1,
      selfieMode: true,
      enableSegmentation: false,
      smoothLandmarks: true
    });
    mpPose.onResults((res) => { poseRes = res; });

    // Instantiate Hands
    const HandsClass = (window.Hands && window.Hands.Hands) ? window.Hands.Hands : window.Hands;
    if (!HandsClass) throw new Error('MediaPipe Hands not loaded');
    mpHands = new HandsClass({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`
    });
    mpHands.setOptions({
      selfieMode: true,
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    mpHands.onResults((res) => { handsRes = res; });

    // [!ADD] Instantiate Face Mesh
    const FaceMeshClass = (window.FaceMesh && window.FaceMesh.FaceMesh) ? window.FaceMesh.FaceMesh : window.FaceMesh;
    if (!FaceMeshClass) throw new Error('MediaPipe FaceMesh not loaded');
    mpFaceMesh = new FaceMeshClass({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/${f}`
    });
    mpFaceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });
    mpFaceMesh.onResults((res) => { faceRes = res; }); // Store results in the existing faceRes variable

    running = true;
    log('start_pose_mp');

    // Kick the frame loop
    frameLoop();
  } catch (err) {
    console.warn('Init failed → 2D', err);
    use2D(true);
  }
}

// [!MODIFIED]
function use2D(fromError=false){
  state.mode='2d';
  trkLabel.textContent=fromError?'2D (fallback)':'2D';
  if(videoStream){
    try{videoStream.getTracks().forEach(t=>t.stop());}catch(_){}
  }
  $('#video').classList.add('hidden');
  cancelAnimationFrame(rafId);
  running=false;

  // [!FIX] Updated transform logic to match new CSS
  const vp=$('#viewport').getBoundingClientRect();
  const targetX = vp.width / 2;
  const targetY = vp.height * 0.56;
  hud.style.transform=`translate(${targetX - hud.offsetWidth/2}px, ${targetY - hud.offsetHeight/2}px)`;

  cursorDot.classList.add('hidden');
  hideShoulderFigures();
}

function lerp(a,b,t){return a+(b-a)*t}
function getPointByName(keypoints,name){const lower=name.toLowerCase(); const k=keypoints.find(k=> (k.name||k.part||'').toLowerCase()===lower); return k?{x:k.x,y:k.y,score:k.score??k.confidence??1}:null}
function mapVideoToViewport(x,y){const v=$('#video'); const vp=$('#viewport'); const vr=v.getBoundingClientRect(); const pr=vp.getBoundingClientRect(); const sx=vr.width/v.videoWidth; const sy=vr.height/v.videoHeight; return {x:(vr.left+x*sx)-pr.left, y:(vr.top+y*sy)-pr.top}}
function updateHudTransform(anchor){if(!anchor) return; const a=state.anchor, t=0.2; a.x=lerp(a.x||anchor.x,anchor.x,t); a.y=lerp(a.y||anchor.y,anchor.y,t); a.s=lerp(a.s||anchor.s,anchor.s,t); a.ok=true; state.anchor=a; hud.style.transform=`translate(${a.x-hud.offsetWidth/2}px, ${a.y-hud.offsetHeight/2}px)`}
function setCursor(x,y,pinching){state.hand.x=x; state.hand.y=y; state.hand.visible=true; cursorDot.style.left=`${x}px`; cursorDot.style.top=`${y}px`; cursorDot.classList.toggle('hidden',false); cursorDot.classList.toggle('grab',!!pinching)}
function clearCursor(){state.hand.visible=false; cursorDot.classList.add('hidden')}
function clientPointFromCursor(){const vp=$('#viewport').getBoundingClientRect(); return {x:vp.left+state.hand.x, y:vp.top+state.hand.y}}
function isDropContainer(el){return el && (el.classList.contains('drop') || el.closest('.drop'))}
function handlePinchInteractions(){const pin=state.hand.pinch; const {x,y}=clientPointFromCursor(); const el=document.elementFromPoint(x,y); if(!pin && state.hand.dragEl){ state.hand.dragEl.classList.remove('lifted'); state.hand.dragEl=null; return; } if(pin && !state.hand.dragEl){ if(el && (el.classList.contains('chip')||el.classList.contains('orderItem'))){ state.hand.dragEl=el; el.classList.add('lifted'); log('drag_start',{el:el.textContent.trim(), via:'pinch'}) }} if(state.hand.dragEl){ const over=document.elementFromPoint(x,y); const drop=isDropContainer(over); if(drop){ const c = over.classList.contains('drop')? over : over.closest('.drop'); if(c && state.hand.dragEl.parentElement!==c){ c.appendChild(state.hand.dragEl); } } }}

function hideShoulderFigures(){ if(leftShoulderFigure){ leftShoulderFigure.classList.remove('visible'); leftShoulderFigure.setAttribute('aria-hidden','true'); } if(rightShoulderFigure){ rightShoulderFigure.classList.remove('visible'); rightShoulderFigure.setAttribute('aria-hidden','true'); } }

function setShoulderFiguresEnabled(enabled){ state.showShoulderFigures=enabled; if(btnToggleShoulders){ btnToggleShoulders.classList.toggle('active', enabled); btnToggleShoulders.textContent = enabled ? 'Hide Shoulder Buddies' : 'Shoulder Buddies'; btnToggleShoulders.setAttribute('aria-pressed', enabled?'true':'false'); } if(!enabled){ hideShoulderFigures(); } }

function placeShoulderFigure(el, point, size){ if(!el) return; el.style.width=`${size}px`; el.style.height=`${size}px`; el.style.left=`${point.x}px`; el.style.top=`${point.y - size*0.48}px`; el.classList.add('visible'); el.setAttribute('aria-hidden','false'); }

function updateShoulderFigures(poseKp){
  if(!state.showShoulderFigures){
    hideShoulderFigures();
    return;
  }

  const left = poseKp.find(k=>k.name==='left_shoulder');
  const right = poseKp.find(k=>k.name==='right_shoulder');
  const leftValid = left && (left.score??0) > 0.35;
  const rightValid = right && (right.score??0) > 0.35;
  const leftPoint = leftValid ? mapVideoToViewport(left.x, left.y) : null;
  const rightPoint = rightValid ? mapVideoToViewport(right.x, right.y) : null;

  let span = null;
  if(leftPoint && rightPoint){
    span = Math.hypot(rightPoint.x - leftPoint.x, rightPoint.y - leftPoint.y);
  } else if(state.anchor && state.anchor.s){
    span = state.anchor.s;
  }
  const baseSize = span ? Math.min(140, Math.max(60, span * 0.45)) : 80;

  if(leftPoint){
    placeShoulderFigure(leftShoulderFigure, leftPoint, baseSize);
  } else if(leftShoulderFigure){
    leftShoulderFigure.classList.remove('visible');
    leftShoulderFigure.setAttribute('aria-hidden','true');
  }

  if(rightPoint){
    placeShoulderFigure(rightShoulderFigure, rightPoint, baseSize);
  } else if(rightShoulderFigure){
    rightShoulderFigure.classList.remove('visible');
    rightShoulderFigure.setAttribute('aria-hidden','true');
  }
}
function drawPoseSkeleton(ctx,toCanvas,kp){const conn=[['left_shoulder','right_shoulder'],['left_shoulder','left_elbow'],['left_elbow','left_wrist'],['right_shoulder','right_elbow'],['right_elbow','right_wrist'],['left_shoulder','left_hip'],['right_shoulder','right_hip'],['left_hip','right_hip']]; ctx.lineWidth=2; ctx.strokeStyle='white'; conn.forEach(([a,b])=>{const A=getPointByName(kp,a), B=getPointByName(kp,b); if(!(A&&B)) return; const Ac=toCanvas(A), Bc=toCanvas(B); ctx.beginPath(); ctx.moveTo(Ac.x,Ac.y); ctx.lineTo(Bc.x,Bc.y); ctx.stroke();}); ctx.fillStyle='white'; kp.forEach(pt=>{ if(pt.score>0.3){ const c=toCanvas(pt); ctx.beginPath(); ctx.arc(c.x,c.y,2,0,Math.PI*2); ctx.fill(); } });}
function drawHandSkeleton(ctx,toCanvas,kp){const C=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]]; ctx.lineWidth=2; ctx.strokeStyle='rgba(106,166,255,.9)'; C.forEach(([i,j])=>{const A=kp[i],B=kp[j]; if(!(A&&B)) return; const Ac=toCanvas(A), Bc=toCanvas(B); ctx.beginPath(); ctx.moveTo(Ac.x,Ac.y); ctx.lineTo(Bc.x,Bc.y); ctx.stroke();}); ctx.fillStyle='rgba(106,166,255,1)'; kp.forEach(pt=>{const c=toCanvas(pt); ctx.beginPath(); ctx.arc(c.x,c.y,2,0,Math.PI*2); ctx.fill();});}
function drawDebug(poses,hands){const c=$('#debug'), v=$('#video'), vp=$('#viewport'); const vr=v.getBoundingClientRect(), pr=vp.getBoundingClientRect(); const w=c.width=260, h=c.height=190; const ctx=c.getContext('2d'); ctx.clearRect(0,0,w,h); function toCanvas(pt){const pv=mapVideoToViewport(pt.x,pt.y); return {x:(pv.x/pr.width)*w, y:(pv.y/pr.height)*h}} if(poses&&poses.length){drawPoseSkeleton(ctx,toCanvas,poses[0].keypoints)} if(hands&&hands.length){drawHandSkeleton(ctx,toCanvas,hands[0].keypoints)}}

const POSE_IDX = {
  'left_shoulder': 11, 'right_shoulder': 12,
  'left_elbow': 13, 'right_elbow': 14,
  'left_wrist': 15, 'right_wrist': 16,
  'left_hip': 23, 'right_hip': 24
};

function buildPoseKeypointsFromMP(v, res){
  if(!res || !res.poseLandmarks) return [];
  // MediaPipe outputs normalized [0..1] in video space
  return Object.entries(POSE_IDX).map(([name, idx])=>{
    const lm = res.poseLandmarks[idx];
    return { name, x: lm.x * v.videoWidth, y: lm.y * v.videoHeight, score: lm.visibility ?? 0.9 };
  });
}

function buildHandKeypointsFromMP(v, res){
  if(!res || !res.multiHandLandmarks || !res.multiHandLandmarks.length) return null;
  const lms = res.multiHandLandmarks[0]; // one hand
  // add names for thumb/index tips used by pinch logic
  const named = lms.map((p, i)=>({ x: p.x * v.videoWidth, y: p.y * v.videoHeight, index:i }));
  named[4].name = 'thumb_tip';
  named[8].name = 'index_finger_tip';
  return named;
}

// [!MODIFIED]
async function frameLoop(){
  if(!running) return;
  const v = document.getElementById('video');

  // Send the same frame to all models
  await mpPose.send({ image: v });
  await mpHands.send({ image: v });
  await mpFaceMesh.send({ image: v }); // [!ADD]

  const poseKp = buildPoseKeypointsFromMP(v, poseRes);
  const handKp = buildHandKeypointsFromMP(v, handsRes);

  // [!MODIFIED] Anchor HUD based on the dropdown setting
  const anchorMode = $('#anchorMode').value;

  if (anchorMode === 'face' && faceRes && faceRes.multiFaceLandmarks && faceRes.multiFaceLandmarks.length) {
    // [!ADD] ANCHOR TO FACE
    const lms = faceRes.multiFaceLandmarks[0];
    const L = lms[234]; // Left cheek
    const R = lms[454]; // Right cheek
    if (L && R) {
      state.lastPoseTs = performance.now();
      const Lp = mapVideoToViewport(L.x * v.videoWidth, L.y * v.videoHeight);
      const Rp = mapVideoToViewport(R.x * v.videoWidth, R.y * v.videoHeight);
      const midx = (Lp.x + Rp.x) / 2;
      const faceW = Math.hypot(Rp.x - Lp.x, Rp.y - Lp.y);
      const midy = (Lp.y + Rp.y) / 2; // Center of cheeks
      updateHudTransform({ x: midx, y: midy, s: faceW * 2.5 }); // Multiplier makes HUD size appropriate
      trkLabel.textContent = 'OK (face anchor)';
    }
  } else if (anchorMode === 'torso' && poseKp.length) {
    // [!ADD] (This is your original logic, now in an 'else if')
    const L = poseKp.find(k=>k.name==='left_shoulder');
    const R = poseKp.find(k=>k.name==='right_shoulder');
    if(L && R && L.score>0.3 && R.score>0.3){
      state.lastPoseTs = performance.now();
      const Lp = mapVideoToViewport(L.x, L.y);
      const Rp = mapVideoToViewport(R.x, R.y);
      const midx = (Lp.x+Rp.x)/2;
      const shoulderW = Math.hypot(Rp.x-Lp.x, Rp.y-Lp.y);
      const midy = (Lp.y+Rp.y)/2 + 0.25*shoulderW;
      updateHudTransform({ x:midx, y:midy, s: shoulderW*1.8 });
      trkLabel.textContent='OK (torso anchor)';
    }
  }

  updateShoulderFigures(poseKp);

  if(handKp){
    const idx = handKp.find(p=>p.name==='index_finger_tip');
    const thb = handKp.find(p=>p.name==='thumb_tip');

    let pin = false; // Default to not pinching
    
    // [!MODIFIED] Always show cursor if index finger is visible
    if (idx) {
      const pIdx = mapVideoToViewport(idx.x, idx.y);
      
      // Handle pinch logic only if thumb is also visible
      if (thb) {
        const pThb = mapVideoToViewport(thb.x, thb.y);
        const d = Math.hypot(pIdx.x - pThb.x, pIdx.y - pThb.y);
        pin = state.hand.pinch ? (d < 48) : (d < 32); // hysteresis
      }
      
      state.hand.pinch = pin;
      setCursor(pIdx.x, pIdx.y, pin); // Show cursor at index tip
      handlePinchInteractions(); // Will use state.hand.pinch
      
    } else {
      // No index finger, clear cursor and stop interacting
      pin = false;
      clearCursor();
    }
    
    // Toggle transparency based on the final pinch state
    hud.classList.toggle('interacting', pin);

  } else {
    // No hand detected
    clearCursor();
    hud.classList.toggle('interacting', false);
  }

  // Debug mini-canvas (draw simple skeletons)
  drawDebugFromMP(poseRes, handsRes, faceRes); // [!MODIFIED] Pass face results

  rafId = requestAnimationFrame(frameLoop);
}

// [!MODIFIED]
function drawDebugFromMP(pose, hands, face){ 
  const c = document.getElementById('debug');
  const v = document.getElementById('video'); // 'v' is defined here
  const vp = document.getElementById('viewport');
  const vr = v.getBoundingClientRect(), pr = vp.getBoundingClientRect();
  const w = c.width = 260, h = c.height = 190;
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,w,h);

  function toCanvas(px, py){
    const pv = mapVideoToViewport(px, py);
    return { x: (pv.x/pr.width)*w, y:(pv.y/pr.height)*h };
  }

  // Pose lines (shoulders, arms, hips)
  if(pose && pose.poseLandmarks){
    const kp = buildPoseKeypointsFromMP(v, pose);
    const pairs = [['left_shoulder','right_shoulder'],
                   ['left_shoulder','left_elbow'],['left_elbow','left_wrist'],
                   ['right_shoulder','right_elbow'],['right_elbow','right_wrist'],
                   ['left_shoulder','left_hip'],['right_shoulder','right_hip'],
                   ['left_hip','right_hip']];
    ctx.lineWidth=2; ctx.strokeStyle='white'; ctx.fillStyle='white';
    pairs.forEach(([a,b])=>{
      const A = kp.find(k=>k.name===a), B = kp.find(k=>k.name===b);
      if(!A||!B) return;
      const Ac = toCanvas(A.x, A.y), Bc = toCanvas(B.x, B.y);
      ctx.beginPath(); ctx.moveTo(Ac.x, Ac.y); ctx.lineTo(Bc.x, Bc.y); ctx.stroke();
    });
    kp.forEach(p=>{ const pc = toCanvas(p.x, p.y); ctx.beginPath(); ctx.arc(pc.x, pc.y, 2, 0, Math.PI*2); ctx.fill(); });
  }

  // Hand lines (simple chain)
  if(hands && hands.multiHandLandmarks && hands.multiHandLandmarks.length){
    const lm = hands.multiHandLandmarks[0];
    const C = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    ctx.lineWidth=2; ctx.strokeStyle='rgba(106,166,255,.9)'; ctx.fillStyle='rgba(106,166,255,1)';
    C.forEach(([i,j])=>{
      // [!FIX] Was 'video.videoWidth', now 'v.videoWidth'
      const Ai = toCanvas(lm[i].x * v.videoWidth, lm[i].y * v.videoHeight);
      const Bj = toCanvas(lm[j].x * v.videoWidth, lm[j].y * v.videoHeight);
      ctx.beginPath(); ctx.moveTo(Ai.x, Ai.y); ctx.lineTo(Bj.x, Bj.y); ctx.stroke();
    });
    lm.forEach(p=>{ 
      // [!FIX] Was 'video.videoWidth', now 'v.videoWidth'
      const pc = toCanvas(p.x * v.videoWidth, p.y * v.videoHeight); 
      ctx.beginPath(); 
      ctx.arc(pc.x, pc.y, 2, 0, Math.PI*2); 
      ctx.fill(); 
    });
  }

  // [!ADD] Draw Face Mesh
  if (face && face.multiFaceLandmarks && face.multiFaceLandmarks.length) {
    const lms = face.multiFaceLandmarks[0];
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 0.5;
    if (window.FaceMesh && window.FaceMesh.FACEMESH_TESSELATION) {
      const C = window.FaceMesh.FACEMESH_TESSELATION;
      C.forEach(([i, j]) => {
        if (lms[i] && lms[j]) {
          // [!FIX] Was 'video.videoWidth', now 'v.videoWidth'
          const Ai = toCanvas(lms[i].x * v.videoWidth, lms[i].y * v.videoHeight);
          const Bj = toCanvas(lms[j].x * v.videoWidth, lms[j].y * v.videoHeight);
          ctx.beginPath();
          ctx.moveTo(Ai.x, Ai.y);
          ctx.lineTo(Bj.x, Bj.y);
          ctx.stroke();
        }
      });
    }
  }

  c.classList.remove('hidden');
}

/*************** Mission Engine (core widgets) ***************/
const WIDGETS={
  cardBin: {
    render(container, spec){
      container.innerHTML = '';
      // deck
      const deck=document.createElement('div'); deck.className='deck'; deck.id='deck';
      spec.cards.forEach(c=>{const el=document.createElement('div'); el.className='chip'; el.draggable=true; el.textContent=c.text; el.dataset.id=c.id; deck.appendChild(el)});
      container.appendChild(deck);
      // bins
      const bins=document.createElement('div'); bins.className='bins';
      spec.bins.forEach(b=>{const bin=document.createElement('div'); bin.className='bin'; bin.dataset.bucket=b; bin.innerHTML=`<h4>${b}</h4><div class="drop"></div>`; bins.appendChild(bin)});
      container.appendChild(bins);
      // dnd
      deck.querySelectorAll('.chip').forEach(el=>{ el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain', el.dataset.id); log('drag_start',{item_id:el.dataset.id});}); el.addEventListener('dragend',()=>log('drag_end',{item_id:el.dataset.id}));});
      bins.querySelectorAll('.drop').forEach(z=>{z.addEventListener('dragover',e=>e.preventDefault()); z.addEventListener('drop',e=>{e.preventDefault(); const id=e.dataTransfer.getData('text/plain'); const el=deck.querySelector(`.chip[data-id="${id}"]`); if(el) z.appendChild(el);});});
    },
    score(spec){ let correct=0; const key=Object.fromEntries(spec.cards.map(c=>[c.id,c.bin])); spec.cards.forEach(c=>{const el=document.querySelector(`.chip[data-id="${c.id}"]`); const bin=el.closest('.bin'); const bucket=bin?bin.dataset.bucket:null; if(bucket===key[c.id]) correct++;}); return correct/spec.cards.length; }
  },
  order: {
    render(container, spec){
      container.innerHTML='';
      const ul=document.createElement('ul'); ul.className='orderList'; ul.id='orderList';
      spec.items.forEach(it=>{const li=document.createElement('li'); li.className='orderItem'; li.draggable=true; li.dataset.id=it.id; li.textContent=it.text; ul.appendChild(li)}); container.appendChild(ul);
      // simple drag sort
      let dragEl=null; ul.addEventListener('dragstart',e=>{dragEl=e.target; e.dataTransfer.effectAllowed='move'; log('drag_start',{item_id:dragEl.dataset.id});});
      ul.addEventListener('dragover',e=>{e.preventDefault(); const target=e.target.closest('.orderItem'); if(!dragEl||!target||dragEl===target) return; const rect=target.getBoundingClientRect(); const after=(e.clientY-rect.top) > rect.height/2; target.parentNode.insertBefore(dragEl, after? target.nextSibling : target);});
      ul.addEventListener('drop',()=>log('drag_end',{}));
    },
    score(spec){ const ids=[...document.querySelectorAll('#orderList .orderItem')].map(li=>li.dataset.id); let ok=0; ids.forEach((id,i)=>{ if(id===spec.correct[i]) ok++;}); return ok/ids.length; }
  },
  mcq: {
    render(container, spec){ container.innerHTML=''; const box=document.createElement('div'); box.className='mcq'; box.innerHTML=`<div>${spec.stem}</div>`; spec.options.forEach((o,i)=>{ const lab=document.createElement('label'); lab.innerHTML=`<input type="radio" name="mcq_${spec._qid}" value="${i}"> ${o}`; box.appendChild(lab); }); container.appendChild(box); },
    score(spec){ const v=(document.querySelector(`input[name="mcq_${spec._qid}"]:checked`)||{}).value; return String(v)===String(spec.answer) ? 1 : 0; }
  },
  triadBins: {
    render(container, spec){ container.innerHTML=''; const deck=document.createElement('div'); deck.className='deck'; deck.id='deckTriad'; spec.cards.forEach(c=>{const el=document.createElement('div'); el.className='chip'; el.draggable=true; el.textContent=c.text; el.dataset.id=c.id; deck.appendChild(el)}); container.appendChild(deck);
      const tri=document.createElement('div'); tri.className='triad'; spec.bins.forEach(b=>{const bin=document.createElement('div'); bin.className='bin'; bin.dataset.bucket=b; bin.innerHTML=`<h4>${b}</h4><div class="drop"></div>`; tri.appendChild(bin)}); container.appendChild(tri);
      deck.querySelectorAll('.chip').forEach(el=>{ el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain', el.dataset.id); log('drag_start',{item_id:el.dataset.id});}); el.addEventListener('dragend',()=>log('drag_end',{item_id:el.dataset.id}));});
      tri.querySelectorAll('.drop').forEach(z=>{z.addEventListener('dragover',e=>e.preventDefault()); z.addEventListener('drop',e=>{e.preventDefault(); const id=e.dataTransfer.getData('text/plain'); const el=deck.querySelector(`.chip[data-id="${id}"]`); if(el) z.appendChild(el);});}); },
    score(spec){ let correct=0; const key=Object.fromEntries(spec.cards.map(c=>[c.id,c.bin])); spec.cards.forEach(c=>{const el=document.querySelector(`.chip[data-id="${c.id}"]`); const bin=el.closest('.bin'); const bucket=bin?bin.dataset.bucket:null; if(bucket===key[c.id]) correct++;}); return correct/spec.cards.length; }
  }
};

/*************** Mission flow ***************/
function startMissions(){ state.missionIdx=0; showMission(0); }
function showMission(i){ const m=WEEK_CONFIG.missions[i]; if(!m){ return; } $('#missionTitle').textContent = `Mission ${m.id} — ${m.title}`; const body=$('#missionBody'); body.innerHTML=''; state.currentBlocks=[]; if(m.type==='cardBin'||m.type==='order'){ const sec=document.createElement('div'); sec.className='card'; const h=document.createElement('h3'); h.textContent=m.subtitle||'Drag & drop'; sec.appendChild(h); const inner=document.createElement('div'); sec.appendChild(inner); body.appendChild(sec); WIDGETS[m.type].render(inner,m); }
  else if(m.type==='mcq'){ const sec=document.createElement('div'); sec.className='card'; const inner=document.createElement('div'); sec.appendChild(inner); body.appendChild(sec); m._qid = m._qid || Math.random().toString(36).slice(2,7); WIDGETS.mcq.render(inner,m); }
  else if(m.type==='multi'){ m.blocks.forEach((b,idx)=>{ b._qid = b._qid || `${m.id}_${idx}`; const sec=document.createElement('div'); sec.className='card'; const h=document.createElement('h3'); h.textContent = (b.subtype==='mcq' ? `MCQ` : `Drag to bins`); sec.appendChild(h); const inner=document.createElement('div'); sec.appendChild(inner); body.appendChild(sec); if(b.subtype==='mcq'){ WIDGETS.mcq.render(inner,b); } else if(b.subtype==='triadBins'){ WIDGETS.triadBins.render(inner,b); } }); }
  $('#appTitle').textContent = WEEK_CONFIG.title + ' · Core Scaffold'; swapScreens('#screenMission'); log('mission_start',{id:m.id}); }

function checkMission(){ const m=WEEK_CONFIG.missions[state.missionIdx]; let frac=0; if(m.type==='cardBin'||m.type==='order'){ frac = WIDGETS[m.type].score(m); }
  else if(m.type==='mcq'){ frac = WIDGETS.mcq.score(m); }
  else if(m.type==='multi'){ let total=0, got=0; m.blocks.forEach(b=>{ if(b.subtype==='mcq'){ total+=1; got+=WIDGETS.mcq.score(b); } else if(b.subtype==='triadBins'){ total+=1; got+=WIDGETS.triadBins.score(b); } }); frac = (total>0? got/total : 0); }
  const pts = (WEEK_CONFIG.weights[m.id]||0) * frac; state.scores[m.id]=Math.round(pts*10)/10; $('#missionScore').textContent=`Score ${state.scores[m.id].toFixed(1)} / ${(WEEK_CONFIG.weights[m.id]||0).toFixed(1)}`; log('check_click',{id:m.id, frac, points:state.scores[m.id]}); setTimeout(()=>advance(), 700); }
function advance(){ state.missionIdx++; if(state.missionIdx < WEEK_CONFIG.missions.length){ showMission(state.missionIdx); } else { swapScreens('#screenWrap'); log('mission_start',{id:'wrap'}) } }

/*************** Downloads + Import ***************/
$('#btnDownloadJSON').addEventListener('click', ()=>{const jsonl=state.events.map(e=>JSON.stringify(e)).join('\n'); const blob=new Blob([jsonl],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`week${WEEK_CONFIG.week}_log_${state.participant}.jsonl`; a.click(); URL.revokeObjectURL(url);});
$('#btnDownloadCSV').addEventListener('click', ()=>{const cols=['participant_id','condition','mission','action','timestamp_ms','latency_ms','payload']; const rows=[cols.join(',')].concat(state.events.map(e=>{const payload=JSON.stringify(e.payload).replaceAll('"','""'); return [e.participant_id,e.condition,e.mission,e.action,e.timestamp_ms,e.latency_ms,`"${payload}"`].join(',')})); const blob=new Blob([rows.join('\n')],{type:'text/csv'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`week${WEEK_CONFIG.week}_log_${state.participant}.csv`; a.click(); URL.revokeObjectURL(url);});
$('#btnFinish').addEventListener('click', ()=>{const conf=Number($('#confidence').value)||0; const ref=$('#reflection').value.trim(); log('submit',{confidence:conf, reflection:ref, scores:state.scores}); const total = Object.values(state.scores).reduce((a,b)=>a+b,0); $('#finalScore').textContent=`Total ≈ ${total.toFixed(1)} / ${Object.values(WEEK_CONFIG.weights).reduce((a,b)=>a+b,0).toFixed(1)}`;});
$('#confidence').addEventListener('input', e=>$('#confVal').textContent=e.target.value);

// Importer
const dlg=$('#importDlg'); $('#btnImport').addEventListener('click', ()=>dlg.showModal()); $('#btnApplyImport').addEventListener('click', (e)=>{e.preventDefault(); try{ const obj=JSON.parse($('#importText').value); WEEK_CONFIG=obj; state.scores={}; $('#appTitle').textContent=WEEK_CONFIG.title + ' · Core Scaffold'; dlg.close(); alert('Config loaded. Click Begin Mission A.'); }catch(err){ alert('Invalid JSON: '+err.message); }});

/*************** Controls ***************/
$('#btnStart').addEventListener('click', startCamera);
$('#btn2D').addEventListener('click', ()=>{use2D(false); log('start_2d')});
$('#btnToggleDebug').addEventListener('click', ()=>$('#debug').classList.toggle('hidden'));
if(btnToggleShoulders){ btnToggleShoulders.addEventListener('click', ()=>{ const next=!state.showShoulderFigures; setShoulderFiguresEnabled(next); log('toggle_shoulder_figures',{enabled:next}); }); }
$('#btnBeginA').addEventListener('click', ()=>{swapScreens('#screenMission'); startMissions();});
$('#btnCheck').addEventListener('click', checkMission);

// init
setShoulderFiguresEnabled(false);
swapScreens('#screenOnboarding');
