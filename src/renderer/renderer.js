// --- UI State ---
const state = {
  me: null,
  interfaces: [],
  devices: [], // Discovered peers
  selectedPeerId: null,
  selectedFile: null,
  activeTab: 'files', // 'files' or 'text'
  activeTransfers: new Map(), // transferId -> progress object
  currentInvite: null, // holds details of currently visible incoming invite
  chatHistory: [], // array of messages: { id, sender: { id, alias }, receiverId, text, time }
  activeChartSessionId: null,
  speedChartInstance: null,
  lastTransfersKey: null,

  // WebRTC Call State
  callState: 'idle', // 'idle', 'calling', 'ringing', 'connected'
  callPeerId: null, // peer ID of the other side of the call
  localStream: null,
  peerConnection: null,
  isMicEnabled: false,
  isCamEnabled: true,
  incomingCallPayload: null,
  iceCandidateBuffer: []
};

// --- DOM Cache ---
const els = {
  headerLogo: document.getElementById('headerLogo'),
  themeToggleLight: document.getElementById('themeToggleLight'),
  themeToggleDark: document.getElementById('themeToggleDark'),
  localDeviceAlias: document.getElementById('localDeviceAlias'),
  localDeviceDetails: document.getElementById('localDeviceDetails'),
  localIpList: document.getElementById('localIpList'),
  interfaceCount: document.getElementById('interfaceCount'),
  peerConnectForm: document.getElementById('peerConnectForm'),
  peerIpInput: document.getElementById('peerIpInput'),
  peerConnectBtn: document.getElementById('peerConnectBtn'),
  scanSubnetBtn: document.getElementById('scanSubnetBtn'),
  rescanBtn: document.getElementById('rescanBtn'),
  deviceList: document.getElementById('deviceList'),
  radarContainer: document.getElementById('radarContainer'),
  radarStatusText: document.getElementById('radarStatusText'),
  tabFilesBtn: document.getElementById('tabFilesBtn'),
  tabTextBtn: document.getElementById('tabTextBtn'),
  tabLogBtn: document.getElementById('tabLogBtn'),
  tabFilesContent: document.getElementById('tabFilesContent'),
  tabTextContent: document.getElementById('tabTextContent'),
  tabLogContent: document.getElementById('tabLogContent'),
  fileDropzone: document.getElementById('fileDropzone'),
  pickFileBtn: document.getElementById('pickFileBtn'),
  selectedFileCard: document.getElementById('selectedFileCard'),
  selectedFileName: document.getElementById('selectedFileName'),
  selectedFileSize: document.getElementById('selectedFileSize'),
  clearFileBtn: document.getElementById('clearFileBtn'),

  // Chat DOMs
  textMessageForm: document.getElementById('textMessageForm'),
  textMessageInput: document.getElementById('textMessageInput'),
  sendMsgBtn: document.getElementById('sendMsgBtn'),
  chatMessages: document.getElementById('chatMessages'),

  selectedTargetBadge: document.getElementById('selectedTargetBadge'),
  transmitBtn: document.getElementById('transmitBtn'),
  activeTransmissionsBadge: document.getElementById('activeTransmissionsBadge'),
  transferList: document.getElementById('transferList'),
  eventLog: document.getElementById('eventLog'),
  clearLogBtn: document.getElementById('clearLogBtn'),

  // Invite Modal
  incomingInviteModal: document.getElementById('incomingInviteModal'),
  inviteSenderName: document.getElementById('inviteSenderName'),
  inviteFileList: document.getElementById('inviteFileList'),
  declineInviteBtn: document.getElementById('declineInviteBtn'),
  acceptInviteBtn: document.getElementById('acceptInviteBtn'),

  // Speed Chart Modal & Center Panel
  speedChartModal: document.getElementById('speedChartModal'),
  chartModalTitle: document.getElementById('chartModalTitle'),
  chartModalSubtitle: document.getElementById('chartModalSubtitle'),
  modalPauseBtn: document.getElementById('modalPauseBtn'),
  modalCancelBtn: document.getElementById('modalCancelBtn'),
  modalDeleteBtn: document.getElementById('modalDeleteBtn'),
  modalCloseBtn: document.getElementById('modalCloseBtn'),
  chartPlaceholder: document.getElementById('chartPlaceholder'),
  chartCanvasContainer: document.getElementById('chartCanvasContainer'),
  speedChartHeaderTitle: document.getElementById('speedChartHeaderTitle'),
  speedChartHeaderSubtitle: document.getElementById('speedChartHeaderSubtitle'),
  speedChartDetailsText: document.getElementById('speedChartDetailsText'),

  // Video Call DOMs
  startCallBtn: document.getElementById('startCallBtn'),
  hangUpBtn: document.getElementById('hangUpBtn'),
  toggleMicBtn: document.getElementById('toggleMicBtn'),
  toggleCamBtn: document.getElementById('toggleCamBtn'),
  micIcon: document.getElementById('micIcon'),
  camIcon: document.getElementById('camIcon'),
  remoteVideo: document.getElementById('remoteVideo'),
  localVideo: document.getElementById('localVideo'),
  videoPlaceholder: document.getElementById('videoPlaceholder'),
  callPlaceholderText: document.getElementById('callPlaceholderText'),
  callStatusBadge: document.getElementById('callStatusBadge'),
  callActiveActions: document.getElementById('callActiveActions'),

  // Incoming Call Modal DOMs
  incomingCallModal: document.getElementById('incomingCallModal'),
  incomingCallSenderName: document.getElementById('incomingCallSenderName'),
  declineCallBtn: document.getElementById('declineCallBtn'),
  acceptCallBtn: document.getElementById('acceptCallBtn'),

  // Ping Diagnostics Modal DOMs
  pingDeviceBtn: document.getElementById('pingDeviceBtn'),
  pingModal: document.getElementById('pingModal'),
  pingModalSubtitle: document.getElementById('pingModalSubtitle'),
  pingConsole: document.getElementById('pingConsole'),
  pingProgressBar: document.getElementById('pingProgressBar'),
  pingSummary: document.getElementById('pingSummary'),
  pingSentCount: document.getElementById('pingSentCount'),
  pingRecvCount: document.getElementById('pingRecvCount'),
  pingLostCount: document.getElementById('pingLostCount'),
  pingLossPercent: document.getElementById('pingLossPercent'),
  pingMinRtt: document.getElementById('pingMinRtt'),
  pingMaxRtt: document.getElementById('pingMaxRtt'),
  pingAvgRtt: document.getElementById('pingAvgRtt'),
  pingSpeedRating: document.getElementById('pingSpeedRating'),
  pingRetryBtn: document.getElementById('pingRetryBtn'),
  pingCloseBtn: document.getElementById('pingCloseBtn')
};

// --- Boot & Initialization ---
boot();

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('lanlink-theme', theme);
  
  if (els.themeToggleLight && els.themeToggleDark) {
    if (theme === 'light') {
      els.themeToggleLight.classList.add('active');
      els.themeToggleDark.classList.remove('active');
    } else {
      els.themeToggleLight.classList.remove('active');
      els.themeToggleDark.classList.add('active');
    }
  }

  if (els.headerLogo) {
    if (theme === 'light') {
      els.headerLogo.src = './Logo_color.png';
    } else {
      els.headerLogo.src = './logo.png';
    }
  }

  // Redraw chart if active to apply new theme colors
  if (state.activeChartSessionId && state.speedChartInstance) {
    window.openSpeedChartModal(state.activeChartSessionId);
  }
}

async function boot() {
  const savedTheme = localStorage.getItem('lanlink-theme') || 'light';
  applyTheme(savedTheme);

  addLog('info', 'Đang khởi động giao diện truyền dẫn quang PON...');

  try {
    // 1. Get local device info
    state.me = await window.lanlink.getInfo();
    updateLocalDeviceCard();

    // 2. Fetch and render subnets/interfaces
    await refreshInterfaces();

    // 3. Bind UI interactions
    bindEvents();

    // 4. Register background event listeners from main process
    registerIpcListeners();

    // 5. Initialize transmit bottom bar
    updateTransmitButtonState();

    // 6. Load chat and transfer history from SQLite
    try {
      const dbChat = await window.lanlink.getChatHistory();
      if (dbChat) state.chatHistory = dbChat;
    } catch (dbErr) {
      console.error('Failed to load chat history from DB:', dbErr);
    }

    try {
      const dbTransfers = await window.lanlink.getTransmissions();
      if (dbTransfers) {
        for (const t of dbTransfers) {
          state.activeTransfers.set(t.transferId, t);
        }
        renderTransmissions();
      }
    } catch (dbErr) {
      console.error('Failed to load transfers from DB:', dbErr);
    }


    // 7. Polling timer to keep interfaces and active IP in sync (every 5 seconds)
    setInterval(() => {
      refreshInterfaces();
    }, 5000);

    addLog('success', 'Khởi động hệ thống truyền dẫn quang PON thành công. Sẵn sàng truyền tải.');
  } catch (err) {
    addLog('error', `Khởi tạo thất bại: ${err.message}`);
  }
}

function updateLocalDeviceCard() {
  if (state.me) {
    els.localDeviceAlias.textContent = state.me.name;
    els.localDeviceDetails.textContent = `${state.me.deviceModel || 'Máy tính'} • IP: ${state.me.ip || '127.0.0.1'} • Cổng ${state.me.port}`;
  }
}

// --- Network Interfaces Helper ---
async function refreshInterfaces(force = false) {
  try {
    const me = await window.lanlink.getInfo(); // Sync active IP from backend
    const interfaces = await window.lanlink.getInterfaces();

    // Check if anything has changed before updating DOM to prevent redraw flicker
    const listChanged = JSON.stringify(interfaces) !== JSON.stringify(state.interfaces);
    const ipChanged = !state.me || me.ip !== state.me.ip || me.name !== state.me.name;

    if (!force && !listChanged && !ipChanged) {
      return; // No change, skip DOM updates
    }

    state.me = me;
    state.interfaces = interfaces;
    updateLocalDeviceCard();
    els.interfaceCount.textContent = state.interfaces.length;

    if (state.interfaces.length === 0) {
      els.localIpList.innerHTML = '<div class="empty-state-text">Không tìm thấy mạng con hoạt động nào</div>';
      return;
    }

    els.localIpList.innerHTML = state.interfaces.map(iface => `
      <div class="local-ip-item ${iface.address === state.me.ip ? 'active' : ''}" data-ip="${escapeHtml(iface.address)}">
        <div class="ip-info-group">
          <div class="ip-radio-btn"></div>
          <div class="ip-meta">
            <strong>${escapeHtml(iface.address)}</strong>
            <span>${escapeHtml(iface.name)}</span>
          </div>
        </div>
        <span class="ip-badge ${escapeHtml(iface.type.toLowerCase())}">${escapeHtml(iface.type)}</span>
      </div>
    `).join('');

    // Bind click events to subnet items to switch active listening IP
    els.localIpList.querySelectorAll('.local-ip-item').forEach(el => {
      el.addEventListener('click', async () => {
        const ip = el.dataset.ip;
        addLog('info', `Đã nhấp giao diện IP: ${ip}`);
        if (ip === state.me.ip) return; // Already active

        try {
          const newIp = await window.lanlink.setActiveIp(ip);
          state.me.ip = newIp;
          addLog('info', `Đã chuyển giao diện IP hoạt động sang: ${newIp}`);
          refreshInterfaces(true);

          // Automatically trigger network discovery sweep on the new active interface
          addLog('info', `Đang khởi chạy quét thiết bị trên giao diện ${newIp}...`);
          window.lanlink.rescan().catch(err => {
            addLog('error', `Quét thiết bị khi chuyển đổi thất bại: ${err.message}`);
          });
        } catch (e) {
          addLog('error', `Chuyển đổi IP hoạt động thất bại: ${e.message}`);
        }
      });
    });

  } catch (e) {
    addLog('error', `Lấy danh sách giao diện mạng thất bại: ${e.message}`);
  }
}

// --- Bind DOM Events ---
function bindEvents() {
  // Theme Switching
  if (els.themeToggleLight) {
    els.themeToggleLight.addEventListener('click', () => applyTheme('light'));
  }
  if (els.themeToggleDark) {
    els.themeToggleDark.addEventListener('click', () => applyTheme('dark'));
  }

  // Tab Switching
  els.tabFilesBtn.addEventListener('click', () => switchTab('files'));
  els.tabTextBtn.addEventListener('click', () => switchTab('text'));
  els.tabLogBtn.addEventListener('click', () => switchTab('log'));

  // File Picking
  els.pickFileBtn.addEventListener('click', pickFile);
  els.fileDropzone.addEventListener('click', pickFile);

  // Drag and Drop files
  els.fileDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    els.fileDropzone.style.borderColor = 'var(--accent-cyan)';
  });

  els.fileDropzone.addEventListener('dragleave', () => {
    els.fileDropzone.style.borderColor = 'var(--btn-secondary-border)';
  });

  els.fileDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.fileDropzone.style.borderColor = 'var(--btn-secondary-border)';

    const file = e.dataTransfer.files[0];
    if (file) {
      const filePath = window.lanlink.getPathForFile(file);
      selectLocalFile({
        path: filePath,
        name: file.name,
        size: file.size
      });
    }
  });

  // Clear Selected File
  els.clearFileBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // prevent triggering pickFile
    state.selectedFile = null;
    els.selectedFileCard.style.display = 'none';
    els.fileDropzone.style.display = 'flex';
    updateTransmitButtonState();
  });

  // Inline Chat Form submit
  els.textMessageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = els.textMessageInput.value.trim();
    if (!text || !state.selectedPeerId) return;

    els.textMessageInput.disabled = true;
    els.sendMsgBtn.disabled = true;

    try {
      await window.lanlink.sendMessage({
        text,
        targets: [state.selectedPeerId]
      });
      els.textMessageInput.value = '';
    } catch (err) {
      addLog('error', `Gửi tin nhắn thất bại: ${err.message}`);
    } finally {
      els.textMessageInput.disabled = false;
      els.sendMsgBtn.disabled = false;
      els.textMessageInput.focus();
    }
  });

  // Connect manually by IP
  els.peerConnectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ip = els.peerIpInput.value.trim();
    if (!ip) return;

    els.peerConnectBtn.disabled = true;
    addLog('info', `Đang kiểm tra thiết bị thủ công tại ${ip}...`);

    try {
      await window.lanlink.connectPeer(ip);
      els.peerIpInput.value = '';
    } catch (err) {
      addLog('error', `Kết kết thủ công tới ${ip} thất bại: ${err.message}`);
    } finally {
      els.peerConnectBtn.disabled = false;
    }
  });

  // Scan entire subnet manually
  els.scanSubnetBtn.addEventListener('click', async () => {
    const inputVal = els.peerIpInput.value.trim();
    if (!inputVal) {
      els.scanSubnetBtn.disabled = true;
      addLog('info', 'Chưa chỉ định tiền tố mạng con tùy chỉnh. Đang quét lại mạng con hoạt động hiện tại...');
      els.radarStatusText.textContent = 'Đang quét mạng con hoạt động...';

      try {
        await window.lanlink.rescan();
        addLog('success', 'Quét mạng con hoạt động hoàn tất.');
      } catch (err) {
        addLog('error', `Quét mạng con hoạt động thất bại: ${err.message}`);
      } finally {
        els.scanSubnetBtn.disabled = false;
        els.radarStatusText.textContent = 'Đang phát thông tin thông báo...';
      }
      return;
    }

    const match = inputVal.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (!match) {
      addLog('error', 'Định dạng IP hoặc tiền tố mạng con không hợp lệ. Ví dụ: 192.168.1.15');
      return;
    }

    const prefix = match[1];
    els.scanSubnetBtn.disabled = true;
    addLog('info', `Đang chạy quét thủ công mạng con ${prefix}.x...`);

    try {
      await window.lanlink.scanCustomSubnet(prefix);
      addLog('success', `Quét thủ công mạng con ${prefix}.x hoàn tất.`);
    } catch (err) {
      addLog('error', `Quét thủ công mạng con thất bại: ${err.message}`);
    } finally {
      els.scanSubnetBtn.disabled = false;
    }
  });

  // Rescan / Scan network button
  els.rescanBtn.addEventListener('click', async () => {
    els.rescanBtn.disabled = true;
    addLog('info', 'Đang quét mạng LAN hoạt động (UDP Multicast + TCP scan)...');
    els.radarStatusText.textContent = 'Đang quét dải mạng con...';

    try {
      await window.lanlink.rescan();
    } catch (err) {
      addLog('error', `Quét mạng thất bại: ${err.message}`);
    } finally {
      setTimeout(() => {
        els.rescanBtn.disabled = false;
        els.radarStatusText.textContent = 'Đang phát thông tin thông báo...';
      }, 2000);
    }
  });

  // Transmit Data Action (for files tab only now)
  els.transmitBtn.addEventListener('click', transmitData);

  // Invite Modal Action Buttons
  els.declineInviteBtn.addEventListener('click', declineIncomingInvite);
  els.acceptInviteBtn.addEventListener('click', acceptIncomingInvite);

  // Speed Chart Modal Listeners
  els.modalCloseBtn.addEventListener('click', window.closeSpeedChartModal);
  els.speedChartModal.addEventListener('click', (e) => {
    if (e.target === els.speedChartModal) {
      window.closeSpeedChartModal();
    }
  });

  // Clear Event Logs button
  els.clearLogBtn.addEventListener('click', () => {
    els.eventLog.innerHTML = '';
  });

  // WebRTC Call Button clicks
  els.startCallBtn.addEventListener('click', startCall);
  els.hangUpBtn.addEventListener('click', hangUpCall);
  els.toggleMicBtn.addEventListener('click', toggleMicrophone);
  els.toggleCamBtn.addEventListener('click', toggleCamera);

  // Call Modal buttons
  els.acceptCallBtn.addEventListener('click', acceptCall);
  els.declineCallBtn.addEventListener('click', declineCall);

  // Ping Diagnostics Listeners
  els.pingDeviceBtn.addEventListener('click', () => {
    const peer = state.devices.find(d => d.id === state.selectedPeerId);
    if (peer && peer.ip) {
      startManualPing(peer.ip);
    }
  });

  els.pingRetryBtn.addEventListener('click', () => {
    if (currentPingIp) {
      startManualPing(currentPingIp);
    }
  });

  els.pingCloseBtn.addEventListener('click', () => {
    els.pingModal.classList.remove('open');
  });

  els.pingModal.addEventListener('click', (e) => {
    if (e.target === els.pingModal && !els.pingCloseBtn.disabled) {
      els.pingModal.classList.remove('open');
    }
  });
}

// --- IPC Event Listeners from Main Process ---
function registerIpcListeners() {
  window.lanlink.onDevices((devicesList) => {
    state.devices = devicesList;
    renderPeersGrid();

    // If our selected peer went offline, disable input
    if (state.selectedPeerId && !state.devices.some(d => d.id === state.selectedPeerId && d.status === 'online')) {
      state.selectedPeerId = null;
      renderChatMessages();
      updateTransmitButtonState();
    }
  });

  // Logs from backend
  window.lanlink.onLog((payload) => {
    addLog(payload.type, payload.message);
  });

  // Incoming Transfer invite modal trigger
  window.lanlink.onInvite((invite) => {
    state.currentInvite = invite;

    els.inviteSenderName.textContent = invite.sender.alias;
    els.inviteFileList.innerHTML = invite.files.map(f => `
      <div class="invite-file-item">
        <span class="invite-filename" title="${escapeHtml(f.fileName)}">${escapeHtml(f.fileName)}</span>
        <span class="badge">${formatBytes(f.size)}</span>
      </div>
    `).join('');

    els.incomingInviteModal.classList.add('open');
  });

  // Upload/Download file progress update
  window.lanlink.onFileProgress((progress) => {
    const existing = state.activeTransfers.get(progress.transferId) || { speedHistory: [] };
    const updated = { ...existing, ...progress };

    const isActiveStatus = (status) => status === 'sending' || status === 'receiving';

    // Record speed history during active transfers
    if (isActiveStatus(progress.status) && progress.speedMbps !== undefined) {
      updated.speedHistory = existing.speedHistory || [];
      updated.speedHistory.push({
        time: Date.now(),
        speed: progress.speedMbps
      });
      if (updated.speedHistory.length > 40) {
        updated.speedHistory.shift();
      }
    }

    // Calculate active duration
    if (isActiveStatus(progress.status)) {
      if (existing.lastActiveTime && isActiveStatus(existing.status)) {
        const delta = Date.now() - existing.lastActiveTime;
        updated.durationMs = (existing.durationMs || 0) + delta;
      } else {
        updated.durationMs = existing.durationMs || 0;
      }
      updated.lastActiveTime = Date.now();
    } else {
      if (progress.status === 'completed' || progress.status === 'failed' || progress.status === 'canceled') {
        if (existing.lastActiveTime && isActiveStatus(existing.status)) {
          const delta = Date.now() - existing.lastActiveTime;
          updated.durationMs = (existing.durationMs || 0) + delta;
        }
      }
      updated.lastActiveTime = null;
    }

    state.activeTransfers.set(progress.transferId, updated);

    // Save to SQLite on initial progress or status transitions
    const isNew = !existing.status;
    const hasStatusChanged = existing.status !== progress.status;
    if (isNew || hasStatusChanged) {
      window.lanlink.saveTransmission({
        transferId: updated.transferId,
        name: updated.name,
        size: updated.size,
        transferred: updated.transferred,
        progress: updated.progress,
        status: updated.status,
        durationMs: updated.durationMs || 0,
        receiverId: updated.receiverId || '',
        senderId: updated.senderId || '',
        timestamp: updated.timestamp || Date.now(),
        speedHistory: updated.speedHistory || []
      }).catch(err => console.error('Failed to save transmission to DB:', err));
    }

    renderTransmissions();

    // Real-time speed chart update or auto-focus
    if (isActiveStatus(progress.status)) {
      if (!state.activeChartSessionId || state.activeChartSessionId === progress.transferId) {
        if (state.activeChartSessionId !== progress.transferId) {
          window.openSpeedChartModal(progress.transferId);
        } else {
          updateActiveChart(updated);
        }
      }
    } else if (state.activeChartSessionId === progress.transferId) {
      updateActiveChart(updated);
    }
  });

  // Handle incoming or sent chat message
  window.lanlink.onMessage((msg) => {
    state.chatHistory.push(msg);
    renderChatMessages();

    // Save to SQLite
    window.lanlink.saveChatMessage(msg).catch(err => {
      console.error('Failed to save message to DB:', err);
    });

    const isSent = msg.sender.id === state.me.id;
    if (!isSent) {
      addLog('success', `Tin nhắn từ ${msg.sender.alias}: "${msg.text}"`);
    }
  });

  // WebRTC Call Events
  window.lanlink.onCallEvent(async (payload) => {
    const { event, sender, extra } = payload;
    handleCallEvent(event, sender, extra);
  });

  // WebRTC Signaling
  window.lanlink.onSignal(async (payload) => {
    const { signal, senderId } = payload;
    handleSignaling(signal, senderId);
  });

  // Automatically refresh when backend notices network interface changes
  window.lanlink.onInterfaceChanged(() => {
    addLog('info', 'Phát hiện thay đổi phần cứng giao diện mạng. Đang đồng bộ lại mạng con hoạt động...');
    refreshInterfaces();
  });

  // Ping IPC listeners
  window.lanlink.onPingLine((line) => {
    addPingConsoleLine(line);
  });

  window.lanlink.onPingDone((stats) => {
    handlePingDone(stats);
  });
}

// --- UI Actions & Helper Functions ---

function switchTab(tab) {
  state.activeTab = tab;
  if (tab === 'files') {
    els.tabFilesBtn.classList.add('active');
    els.tabTextBtn.classList.remove('active');
    els.tabLogBtn.classList.remove('active');
    els.tabFilesContent.style.display = 'flex';
    els.tabTextContent.style.display = 'none';
    els.tabLogContent.style.display = 'none';
    els.transmitBtn.style.display = 'inline-flex';
  } else if (tab === 'text') {
    els.tabFilesBtn.classList.remove('active');
    els.tabTextBtn.classList.add('active');
    els.tabLogBtn.classList.remove('active');
    els.tabFilesContent.style.display = 'none';
    els.tabTextContent.style.display = 'flex';
    els.tabLogContent.style.display = 'none';
    els.transmitBtn.style.display = 'none'; // Chat has its own submit composer button

    renderChatMessages();
  } else if (tab === 'log') {
    els.tabFilesBtn.classList.remove('active');
    els.tabTextBtn.classList.remove('active');
    els.tabLogBtn.classList.add('active');
    els.tabFilesContent.style.display = 'none';
    els.tabTextContent.style.display = 'none';
    els.tabLogContent.style.display = 'flex';
    els.transmitBtn.style.display = 'none';
  }
  updateTransmitButtonState();
}

async function pickFile() {
  try {
    const file = await window.lanlink.pickFile();
    if (file) {
      selectLocalFile(file);
    }
  } catch (err) {
    addLog('error', `Mở hộp thoại chọn tệp thất bại: ${err.message}`);
  }
}

function selectLocalFile(file) {
  state.selectedFile = file;
  els.selectedFileName.textContent = file.name;
  els.selectedFileSize.textContent = formatBytes(file.size);

  els.fileDropzone.style.display = 'none';
  els.selectedFileCard.style.display = 'flex';

  updateTransmitButtonState();
}

function selectPeer(peerId) {
  if (state.selectedPeerId === peerId) {
    state.selectedPeerId = null; // toggle selection off
  } else {
    state.selectedPeerId = peerId;
  }

  renderPeersGrid();
  renderChatMessages();
  updateTransmitButtonState();
}

function updateTransmitButtonState() {
  const peerSelected = state.selectedPeerId !== null;
  const fileSelected = state.selectedFile !== null;

  // Toggle bottom transmit button for files tab
  els.transmitBtn.disabled = !(peerSelected && fileSelected);

  // Toggle chat input state
  if (peerSelected) {
    els.textMessageInput.disabled = false;
    els.sendMsgBtn.disabled = false;
  } else {
    els.textMessageInput.disabled = true;
    els.sendMsgBtn.disabled = true;
    els.textMessageInput.value = '';
  }

  // Update target badge details
  if (peerSelected) {
    const peer = state.devices.find(d => d.id === state.selectedPeerId);
    if (peer) {
      els.selectedTargetBadge.textContent = peer.alias;
      els.selectedTargetBadge.classList.remove('empty');
    }
  } else {
    els.selectedTargetBadge.textContent = 'Chưa chọn thiết bị';
    els.selectedTargetBadge.classList.add('empty');
  }

  // Update Call & Ping button state
  if (peerSelected && state.callState === 'idle') {
    const peer = state.devices.find(d => d.id === state.selectedPeerId);
    if (peer && peer.status === 'online') {
      els.startCallBtn.disabled = false;
      els.startCallBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Gọi ${escapeHtml(peer.alias)}</span>
      `;
      els.pingDeviceBtn.disabled = false;
      els.pingDeviceBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
        <span>Đo tốc độ (Ping)</span>
      `;
    } else {
      els.startCallBtn.disabled = true;
      els.startCallBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Gọi thiết bị</span>
      `;
      els.pingDeviceBtn.disabled = true;
      els.pingDeviceBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
        <span>Đo tốc độ (Ping)</span>
      `;
    }
  } else {
    els.startCallBtn.disabled = true;
    els.pingDeviceBtn.disabled = true;
    if (state.callState === 'idle') {
      els.startCallBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>Gọi thiết bị</span>
      `;
      els.pingDeviceBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>
        <span>Đo tốc độ (Ping)</span>
      `;
    }
  }
}

// Transmit Data Action (REST POST to Peer HTTP Server for Files)
async function transmitData() {
  if (!state.selectedPeerId || state.activeTab !== 'files') return;

  const peer = state.devices.find(d => d.id === state.selectedPeerId);
  if (!peer) {
    addLog('error', 'Thiết bị được chọn đã ngoại tuyến hoặc không hợp lệ');
    return;
  }

  els.transmitBtn.disabled = true;

  const file = state.selectedFile;
  addLog('info', `Đang yêu cầu truyền tải tệp: ${file.name} tới ${peer.alias}...`);
  try {
    await window.lanlink.sendFile({
      path: file.path,
      targets: [peer.id]
    });
    addLog('success', `Đã gửi xong tệp ${file.name} tới ${peer.alias}`);

    // Clear file selection
    state.selectedFile = null;
    els.selectedFileCard.style.display = 'none';
    els.fileDropzone.style.display = 'flex';
  } catch (err) {
    addLog('error', `Truyền tải thất bại: ${err.message}`);
  }

  updateTransmitButtonState();
}

// Incoming Invite Actions
async function acceptIncomingInvite() {
  if (!state.currentInvite) return;
  const sessionId = state.currentInvite.sessionId;

  els.incomingInviteModal.classList.remove('open');
  addLog('info', `Đang chấp nhận lời mời nhận tệp đến...`);

  try {
    const result = await window.lanlink.acceptInvite(sessionId);
    if (!result.ok) {
      addLog('error', `Chấp nhận lời mời thất bại: ${result.error}`);
    }
  } catch (err) {
    addLog('error', `Chấp nhận lời mời thất bại: ${err.message}`);
  } finally {
    state.currentInvite = null;
  }
}

async function declineIncomingInvite() {
  if (!state.currentInvite) return;
  const sessionId = state.currentInvite.sessionId;

  els.incomingInviteModal.classList.remove('open');
  addLog('warning', `Đang từ chối lời mời nhận tệp đến...`);

  try {
    await window.lanlink.declineInvite(sessionId);
  } catch (err) {
    addLog('error', `Từ chối lời mời thất bại: ${err.message}`);
  } finally {
    state.currentInvite = null;
  }
}

// --- Render Functions ---

function renderPeersGrid() {
  const onlinePeers = state.devices.filter(d => d.status === 'online');

  if (onlinePeers.length === 0) {
    els.deviceList.innerHTML = '';
    els.radarContainer.style.display = 'flex';
    return;
  }

  // Hide radar when we have peers — list takes over
  els.radarContainer.style.display = 'none';

  els.deviceList.innerHTML = onlinePeers.map(peer => {
    const isSelected = state.selectedPeerId === peer.id;
    let avatarSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
    if (peer.deviceType === 'mobile') {
      avatarSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>`;
    }

    const rttValue = (peer.rtt !== undefined && peer.rtt > 0) ? `${peer.rtt}ms` : '—';
    const rttClass = peer.rtt < 60 ? 'ping-good' : (peer.rtt < 160 ? 'ping-medium' : 'ping-bad');

    return `
      <div class="peer-card ${isSelected ? 'selected' : ''}" onclick="selectPeer('${peer.id}')">
        <div class="peer-avatar">${avatarSvg}</div>
        <div class="peer-card-info">
          <h4 class="peer-alias" title="${escapeHtml(peer.alias)}">${escapeHtml(peer.alias)}</h4>
          <span class="peer-ip">${escapeHtml(peer.ip)}</span>
        </div>
        <div class="peer-card-footer">
          <span class="peer-ping ${rttClass}">${rttValue}</span>
          <span class="peer-type-tag">${escapeHtml(peer.deviceType)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render Chat Conversation history
function renderChatMessages() {
  if (!state.selectedPeerId) {
    els.chatMessages.innerHTML = `<div class="empty-state-text">Chọn một thiết bị để bắt đầu trò chuyện</div>`;
    return;
  }

  const selectedPeer = state.devices.find(d => d.id === state.selectedPeerId);
  const peerName = selectedPeer ? selectedPeer.alias : 'Thiết bị đối tác';

  // Filter messages exchanged with selected peer
  const conversation = state.chatHistory.filter(msg => {
    const isSentToSelected = msg.sender.id === state.me.id && msg.receiverId === state.selectedPeerId;
    const isReceivedFromSelected = msg.sender.id === state.selectedPeerId;
    return isSentToSelected || isReceivedFromSelected;
  });

  if (conversation.length === 0) {
    els.chatMessages.innerHTML = `<div class="empty-state-text"><p>Chưa có tin nhắn nào với <strong>${escapeHtml(peerName)}</strong>.</p><p>Gửi tin nhắn để bắt đầu cuộc trò chuyện!</p></div>`;
    return;
  }

  els.chatMessages.innerHTML = conversation.map(msg => {
    const isSent = msg.sender.id === state.me.id;
    const timeStr = new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `
      <div class="chat-bubble ${isSent ? 'sent' : 'received'}">
        <div class="chat-bubble-text">${escapeHtml(msg.text)}</div>
        <div class="chat-bubble-meta">${timeStr}</div>
      </div>
    `;
  }).join('');

  // Auto scroll to latest message
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

// Expose peer select helper to global scope for HTML inline onclick
window.selectPeer = selectPeer;

function renderTransmissions() {
  const list = Array.from(state.activeTransfers.values());
  const activeCount = list.filter(t => t.status === 'sending' || t.status === 'receiving').length;

  if (activeCount > 0) {
    els.activeTransmissionsBadge.textContent = `${activeCount} đang chạy`;
    els.activeTransmissionsBadge.style.color = 'var(--accent-cyan)';
    els.activeTransmissionsBadge.style.borderColor = 'var(--panel-border-glow)';
    els.activeTransmissionsBadge.style.background = 'var(--accent-cyan-faint)';
  } else {
    els.activeTransmissionsBadge.textContent = 'Đang rảnh';
    els.activeTransmissionsBadge.style.color = 'var(--text-faint)';
    els.activeTransmissionsBadge.style.borderColor = 'var(--btn-secondary-border)';
    els.activeTransmissionsBadge.style.background = 'var(--btn-secondary-bg)';
  }

  if (list.length === 0) {
    state.lastTransfersKey = null;
    els.transferList.innerHTML = `
      <div class="empty-state">
        <p class="muted">Không có tiến trình truyền tải nào</p>
      </div>
    `;
    return;
  }

  // Check if we need to full re-render (status changes or items added/deleted)
  const currentKey = list.map(t => `${t.transferId}:${t.status}`).join(',');
  if (state.lastTransfersKey === currentKey) {
    // Perform in-place updates for progress, speed, and ETA
    for (const item of list) {
      const cardEl = document.getElementById(`transfer-card-${item.transferId}`);
      if (!cardEl) continue;

      const fillEl = cardEl.querySelector('.transfer-progress-fill');
      if (fillEl) fillEl.style.width = `${item.progress}%`;

      const progressTextEl = cardEl.querySelector('.transfer-progress-text');
      if (progressTextEl) {
        progressTextEl.textContent = `${Math.round(item.progress)}% • ${formatProgressBytes(item.transferred, item.size)}`;
      }

      const speedTextEl = cardEl.querySelector('.transfer-speed-text');
      if (speedTextEl) {
        let etaText = '';
        if ((item.status === 'sending' || item.status === 'receiving') && item.speedMbps && item.speedMbps > 0) {
          const remainingBytes = item.size - item.transferred;
          const speedBytesPerSec = (item.speedMbps * 1000000) / 8;
          const etaSeconds = Math.max(0, Math.round(remainingBytes / speedBytesPerSec));
          etaText = ` • ~${formatDuration(etaSeconds * 1000)}`;
        }
        speedTextEl.textContent = `${item.speedMbps ? (item.speedMbps / 8).toFixed(2) + ' MB/s' : '0.00 MB/s'}${etaText}`;
      }

      const maxSpeedEl = cardEl.querySelector('.transfer-max-speed');
      const avgSpeedEl = cardEl.querySelector('.transfer-avg-speed');
      if (maxSpeedEl && avgSpeedEl) {
        const stats = getTransferStats(item);
        maxSpeedEl.textContent = `Tốc độ tối đa: ${(stats.maxSpeedMbps / 8).toFixed(2)} MB/s`;
        avgSpeedEl.textContent = `Tốc độ TB: ${(stats.avgSpeedMbps / 8).toFixed(2)} MB/s`;
      }
    }
    return;
  }

  state.lastTransfersKey = currentKey;

  els.transferList.innerHTML = list.map(item => {
    let actionsHtml = '';
    const isActive = item.status === 'sending' || item.status === 'receiving' || item.status === 'paused';
    if (isActive) {
      const isPaused = item.status === 'paused';
      const pauseIcon = isPaused
        ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>` // Play
        : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`; // Pause

      actionsHtml = `
        <div class="transfer-actions">
          <button class="btn-icon-action" onclick="togglePauseTransfer(event, '${item.transferId}')" title="${isPaused ? 'Tiếp tục' : 'Tạm dừng'}">
            ${pauseIcon}
          </button>
          <button class="btn-icon-action cancel" onclick="cancelTransfer(event, '${item.transferId}')" title="Hủy">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
    } else {
      actionsHtml = `
        <div class="transfer-actions">
          <button class="btn-icon-action delete" onclick="deleteTransfer(event, '${item.transferId}')" title="Xóa khỏi danh sách">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      `;
    }

    let etaText = '';
    if ((item.status === 'sending' || item.status === 'receiving') && item.speedMbps && item.speedMbps > 0) {
      const remainingBytes = item.size - item.transferred;
      const speedBytesPerSec = (item.speedMbps * 1000000) / 8;
      const etaSeconds = Math.max(0, Math.round(remainingBytes / speedBytesPerSec));
      etaText = ` • ~${formatDuration(etaSeconds * 1000)}`;
    }

    const statusMap = {
      sending: 'Đang gửi',
      receiving: 'Đang nhận',
      paused: 'Đã tạm dừng',
      completed: 'Hoàn thành',
      failed: 'Thất bại',
      canceled: 'Đã hủy'
    };

    const stats = getTransferStats(item);

    return `
      <div class="transfer-card" id="transfer-card-${item.transferId}" onclick="openSpeedChartModal('${item.transferId}')" style="cursor: pointer;">
        <div class="transfer-card-header">
          <span class="transfer-filename" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
          ${actionsHtml}
          <span class="transfer-status-tag ${item.status}">${escapeHtml(statusMap[item.status] || item.status)}</span>
        </div>
        <div class="transfer-progress-track">
          <div class="transfer-progress-fill" style="width: ${item.progress}%"></div>
        </div>
        <div class="transfer-card-footer">
          <span class="transfer-progress-text">${Math.round(item.progress)}% • ${formatProgressBytes(item.transferred, item.size)}</span>
          <span class="transfer-speed-text">${item.speedMbps ? (item.speedMbps / 8).toFixed(2) + ' MB/s' : '0.00 MB/s'}${etaText}</span>
        </div>
        <div class="transfer-card-stats" style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-faint); margin-top: 6px; border-top: 1px dashed rgba(255,255,255,0.05); padding-top: 6px;">
          <span class="transfer-max-speed">Tốc độ tối đa: ${(stats.maxSpeedMbps / 8).toFixed(2)} MB/s</span>
          <span class="transfer-avg-speed">Tốc độ TB: ${(stats.avgSpeedMbps / 8).toFixed(2)} MB/s</span>
        </div>
      </div>
    `;
  }).join('');
}

function addLog(type, message) {
  const time = new Date().toLocaleTimeString();
  const logRow = document.createElement('div');
  logRow.className = `log-entry ${type}`;
  logRow.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-label">${escapeHtml(type)}:</span>
    <span class="log-text">${escapeHtml(message)}</span>
  `;

  els.eventLog.appendChild(logRow);
  els.eventLog.scrollTop = els.eventLog.scrollHeight;
}

// --- Utility Functions ---

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function formatProgressBytes(transferred, total, decimals = 2) {
  const t = +transferred || 0;
  const tot = +total || 0;
  if (!tot) return '0 Bytes / 0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(tot) / Math.log(k));

  const totalScaled = parseFloat((tot / Math.pow(k, i)).toFixed(dm));
  const transferredScaled = parseFloat((t / Math.pow(k, i)).toFixed(dm));

  return `${transferredScaled} / ${totalScaled} ${sizes[i]}`;
}

function escapeHtml(unsafe) {
  return String(unsafe || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}ph ${seconds}s`;
  }
  return `${seconds}s`;
}

// --- Speed Chart Helper & Actions ---

function getTransferStats(item) {
  const history = item.speedHistory || [];
  if (history.length === 0) {
    const currentSpeed = item.speedMbps || 0;
    return {
      maxSpeedMbps: currentSpeed,
      avgSpeedMbps: currentSpeed
    };
  }

  let maxSpeed = 0;
  let sumSpeed = 0;
  for (const h of history) {
    if (h.speed > maxSpeed) {
      maxSpeed = h.speed;
    }
    sumSpeed += h.speed;
  }

  return {
    maxSpeedMbps: maxSpeed,
    avgSpeedMbps: sumSpeed / history.length
  };
}

window.openSpeedChartModal = function (transferId) {
  const item = state.activeTransfers.get(transferId);
  if (!item) return;

  state.activeChartSessionId = transferId;

  // Show center canvas container, hide placeholder
  if (els.chartCanvasContainer && els.chartPlaceholder) {
    els.chartCanvasContainer.style.display = 'block';
    els.chartPlaceholder.style.display = 'none';
  }

  // Set header title
  if (els.speedChartHeaderTitle) {
    els.speedChartHeaderTitle.textContent = `Biểu đồ: ${item.name}`;
  }

  // Create Chart
  const ctx = document.getElementById('speedChartCanvas').getContext('2d');

  // Extract history
  const history = item.speedHistory || [];
  const data = history.map(h => h.speed / 8); // convert to MB/s
  const labels = history.map(() => '');

  // Destroy existing chart if any
  if (state.speedChartInstance) {
    state.speedChartInstance.destroy();
  }

  const isLight = state.theme === 'light';
  const tickColor = isLight ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';

  // Draw chart
  state.speedChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tốc độ (MB/s)',
        data: data,
        borderColor: '#22d3ee', // var(--accent-cyan)
        backgroundColor: 'rgba(34, 211, 238, 0.08)',
        borderWidth: 2,
        tension: 0.25,
        fill: true,
        pointRadius: 2,
        pointBackgroundColor: '#22d3ee'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: tickColor, font: { size: 9 } }
        },
        y: {
          min: 0,
          grid: { color: gridColor },
          ticks: { color: tickColor, font: { size: 9 } }
        }
      }
    }
  });

  // Perform initial update of text
  updateActiveChart(item);
};

window.closeSpeedChartModal = function () {
  state.activeChartSessionId = null;
  if (state.speedChartInstance) {
    state.speedChartInstance.destroy();
    state.speedChartInstance = null;
  }
  if (els.chartCanvasContainer && els.chartPlaceholder) {
    els.chartCanvasContainer.style.display = 'none';
    els.chartPlaceholder.style.display = 'flex';
  }
  if (els.speedChartHeaderTitle) {
    els.speedChartHeaderTitle.textContent = 'Đồ thị truyền dẫn';
  }
  if (els.speedChartHeaderSubtitle) {
    els.speedChartHeaderSubtitle.textContent = 'Đang rảnh';
  }
  if (els.speedChartDetailsText) {
    els.speedChartDetailsText.textContent = 'Sẵn sàng hiển thị đồ thị truyền tải';
  }
};

function updateActiveChart(item) {
  if (!state.speedChartInstance) return;

  const stats = getTransferStats(item);

  if (els.speedChartHeaderSubtitle) {
    const statusMap = {
      sending: 'Đang gửi',
      receiving: 'Đang nhận',
      paused: 'Đã tạm dừng',
      completed: 'Hoàn thành',
      failed: 'Thất bại',
      canceled: 'Đã hủy'
    };
    const statusText = statusMap[item.status] || item.status;
    const durationText = item.durationMs !== undefined ? ` • ${formatDuration(item.durationMs)}` : '';
    els.speedChartHeaderSubtitle.textContent = `${statusText} • ${Math.round(item.progress)}% • Tốc độ TB: ${(stats.avgSpeedMbps / 8).toFixed(2)} MB/s${durationText}`;
  }

  if (els.speedChartDetailsText) {
    els.speedChartDetailsText.innerHTML = `Truyền tải: ${formatProgressBytes(item.transferred, item.size)} <br> Hiện tại: ${item.speedMbps ? (item.speedMbps / 8).toFixed(2) + ' MB/s' : '0.00 MB/s'} • Tối đa: ${(stats.maxSpeedMbps / 8).toFixed(2)} MB/s`;
  }

  const history = item.speedHistory || [];
  const data = history.map(h => h.speed / 8); // convert to MB/s
  const labels = history.map(() => '');

  state.speedChartInstance.data.labels = labels;
  state.speedChartInstance.data.datasets[0].data = data;
  state.speedChartInstance.update('none'); // silent update (faster)
}

window.togglePauseTransfer = async function (event, transferId) {
  if (event) event.stopPropagation();
  try {
    const result = await window.lanlink.togglePauseTransfer(transferId);
    if (!result.ok) {
      addLog('error', `Tạm dừng/tiếp tục thất bại: ${result.error}`);
    }
  } catch (err) {
    addLog('error', `Tạm dừng/tiếp tục thất bại: ${err.message}`);
  }
};

window.cancelTransfer = async function (event, transferId) {
  if (event) event.stopPropagation();
  try {
    const result = await window.lanlink.cancelTransfer(transferId);
    if (!result.ok) {
      addLog('error', `Hủy truyền tải thất bại: ${result.error}`);
    }
  } catch (err) {
    addLog('error', `Hủy truyền tải thất bại: ${err.message}`);
  }
};

window.deleteTransfer = function (event, transferId) {
  if (event) event.stopPropagation();
  state.activeTransfers.delete(transferId);
  renderTransmissions();

  // Delete from SQLite
  window.lanlink.deleteTransferFromDb(transferId).catch(err => {
    console.error('Failed to delete transmission from DB:', err);
  });
};

// --- WebRTC Video Call Implementation ---

async function getMediaStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (videoError) {
    addLog('warning', `Camera không khả dụng, chuyển sang chế độ chỉ âm thanh: ${videoError.message}`);
    try {
      return await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    } catch (audioError) {
      addLog('error', `Micrô không khả dụng: ${audioError.message}`);
      throw audioError;
    }
  }
}

async function startCall() {
  if (!state.selectedPeerId || state.callState !== 'idle') return;

  const targetId = state.selectedPeerId;
  const peer = state.devices.find(d => d.id === targetId);
  if (!peer) {
    addLog('error', 'Thiết bị đối tác đã chọn không còn trực tuyến.');
    return;
  }

  addLog('info', `Đang gọi ${peer.alias}...`);
  state.callState = 'calling';
  state.callPeerId = targetId;
  updateCallUI();

  try {
    // 1. Get local stream
    state.localStream = await getMediaStream();

    // Default: mic muted, camera on
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = false; // mic muted by default
    }
    state.isMicEnabled = false;
    state.isCamEnabled = true;

    if (state.localStream.getVideoTracks().length > 0) {
      els.localVideo.srcObject = state.localStream;
      els.localVideo.style.display = 'block';
    } else {
      els.localVideo.style.display = 'none';
    }

    // 2. Setup RTCPeerConnection
    setupPeerConnection(targetId);

    // 3. Create and Send Offer
    const offer = await state.peerConnection.createOffer();
    await state.peerConnection.setLocalDescription(offer);

    await window.lanlink.sendCallEvent({
      event: 'invite',
      targetId,
      extra: { offer }
    });

  } catch (err) {
    addLog('error', `Bắt đầu cuộc gọi thất bại: ${err.message}`);
    resetCallState();
  }
}

function setupPeerConnection(targetId) {
  const rtcConfig = {
    iceServers: [] // Disabled STUN since direct local network connections do not require it
  };

  state.peerConnection = new RTCPeerConnection(rtcConfig);

  // Add tracks
  state.localStream.getTracks().forEach(track => {
    state.peerConnection.addTrack(track, state.localStream);
  });

  // ICE Candidate handler
  state.peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addLog('info', `Đã thu thập ICE candidate cục bộ: ${event.candidate.candidate.slice(0, 30)}...`);
      window.lanlink.sendSignal({
        signal: { type: 'candidate', candidate: event.candidate.toJSON() },
        targetId
      }).then(() => {
        addLog('info', 'Đã gửi ICE candidate tới thiết bị.');
      }).catch(err => {
        addLog('error', `Gửi ICE candidate thất bại: ${err.message}`);
      });
    }
  };

  // Remote track received handler
  state.peerConnection.ontrack = (event) => {
    addLog('success', `Đã nhận luồng truyền thông đối tác: ${event.track.kind}`);
    if (event.streams && event.streams[0]) {
      if (els.remoteVideo.srcObject !== event.streams[0]) {
        els.remoteVideo.srcObject = event.streams[0];
        els.remoteVideo.play().catch(err => console.error("Remote video play failed:", err));
      }
    }
    if (event.track.kind === 'video') {
      els.remoteVideo.style.display = 'block';
      els.videoPlaceholder.style.display = 'none';
    }
  };

  state.peerConnection.oniceconnectionstatechange = () => {
    const iceState = state.peerConnection.iceConnectionState;
    addLog('info', `Trạng thái kết nối ICE: ${iceState}`);
    if (iceState === 'disconnected' || iceState === 'failed') {
      hangUpCall();
    }
  };

  state.peerConnection.onconnectionstatechange = () => {
    const connState = state.peerConnection.connectionState;
    addLog('info', `Trạng thái kết nối thiết bị: ${connState}`);
    if (connState === 'failed') {
      hangUpCall();
    }
  };

  state.peerConnection.onicegatheringstatechange = () => {
    addLog('info', `ICE Gathering State: ${state.peerConnection.iceGatheringState}`);
  };
}

async function acceptCall() {
  if (!state.incomingCallPayload) return;
  els.incomingCallModal.classList.remove('open');

  const { sender, offer } = state.incomingCallPayload;
  addLog('success', `Chấp nhận cuộc gọi từ ${sender.alias}`);

  state.callState = 'connected';
  state.callPeerId = sender.id;
  updateCallUI();

  try {
    // 1. Get local stream
    state.localStream = await getMediaStream();

    // Default: mic muted, camera on
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = false; // mic muted by default
    }
    state.isMicEnabled = false;
    state.isCamEnabled = true;

    if (state.localStream.getVideoTracks().length > 0) {
      els.localVideo.srcObject = state.localStream;
      els.localVideo.style.display = 'block';
    } else {
      els.localVideo.style.display = 'none';
    }

    // 2. Setup RTCPeerConnection
    setupPeerConnection(sender.id);

    // 3. Set remote description
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    await drainIceCandidates();

    // 4. Create and send answer
    const answer = await state.peerConnection.createAnswer();
    await state.peerConnection.setLocalDescription(answer);

    await window.lanlink.sendCallEvent({
      event: 'accept',
      targetId: sender.id,
      extra: { answer }
    });

  } catch (err) {
    addLog('error', `Chấp nhận cuộc gọi thất bại: ${err.message}`);
    // Notify peer of failure
    window.lanlink.sendCallEvent({ event: 'decline', targetId: sender.id }).catch(() => { });
    resetCallState();
  }
}

async function declineCall() {
  if (!state.incomingCallPayload) return;
  els.incomingCallModal.classList.remove('open');

  const { sender } = state.incomingCallPayload;
  addLog('info', `Cuộc gọi từ ${sender.alias} đã bị từ chối.`);

  try {
    await window.lanlink.sendCallEvent({
      event: 'decline',
      targetId: sender.id
    });
  } catch (err) {
    console.error("Failed to send decline event:", err);
  }

  resetCallState();
}

async function hangUpCall() {
  if (state.callState === 'idle') return;
  addLog('info', 'Đang kết thúc cuộc gọi video...');

  if (state.callPeerId) {
    try {
      await window.lanlink.sendCallEvent({
        event: 'hangup',
        targetId: state.callPeerId
      });
    } catch (err) {
      console.error("Failed to send hangup event:", err);
    }
  }

  resetCallState();
}

function resetCallState() {
  state.callState = 'idle';
  state.callPeerId = null;
  state.incomingCallPayload = null;
  state.isMicEnabled = false;
  state.isCamEnabled = true;
  state.iceCandidateBuffer = [];

  // Stop media tracks
  if (state.localStream) {
    state.localStream.getTracks().forEach(track => track.stop());
    state.localStream = null;
  }

  // Close peer connection
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }

  // Reset UI elements
  els.localVideo.style.display = 'none';
  els.localVideo.srcObject = null;
  els.remoteVideo.style.display = 'none';
  els.remoteVideo.srcObject = null;
  els.videoPlaceholder.style.display = 'flex';

  updateCallUI();
}

async function drainIceCandidates() {
  if (!state.peerConnection || !state.peerConnection.remoteDescription || !state.peerConnection.remoteDescription.type) return;
  const candidates = [...state.iceCandidateBuffer];
  state.iceCandidateBuffer = [];
  addLog('info', `Đang xử lý ${candidates.length} ICE candidate đã đệm...`);
  for (const candidate of candidates) {
    try {
      await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      addLog('info', 'Đã thêm ICE candidate đối tác đã đệm.');
    } catch (e) {
      addLog('error', `Lỗi thêm ICE candidate đối tác đã đệm: ${e.message}`);
    }
  }
}

function updateCallUI() {
  els.callStatusBadge.textContent = state.callState.toUpperCase();

  // Style status badge
  els.callStatusBadge.className = 'badge';
  if (state.callState === 'connected') {
    els.callStatusBadge.style.color = 'var(--status-green)';
    els.callStatusBadge.style.borderColor = 'var(--status-green-border)';
    els.callStatusBadge.style.background = 'var(--status-green-faint)';

    els.startCallBtn.style.display = 'none';
    els.callActiveActions.style.display = 'flex';
  } else if (state.callState === 'calling' || state.callState === 'ringing') {
    els.callStatusBadge.style.color = 'var(--status-amber)';
    els.callStatusBadge.style.borderColor = 'var(--status-amber-border)';
    els.callStatusBadge.style.background = 'var(--status-amber-faint)';

    els.startCallBtn.style.display = 'none';
    els.callActiveActions.style.display = 'flex';

    if (state.callState === 'calling') {
      els.callPlaceholderText.textContent = "Đang đổ chuông thiết bị đối tác...";
    }
  } else {
    // idle
    els.callStatusBadge.style.color = 'var(--text-faint)';
    els.callStatusBadge.style.borderColor = 'var(--btn-secondary-border)';
    els.callStatusBadge.style.background = 'var(--btn-secondary-bg)';

    els.startCallBtn.style.display = 'inline-flex';
    els.callActiveActions.style.display = 'none';

    els.callPlaceholderText.textContent = "Sẵn sàng bắt đầu cuộc gọi LAN";
  }

  // Reset mic/cam icons
  els.micIcon.style.color = state.isMicEnabled ? 'inherit' : 'var(--status-red)';
  els.camIcon.style.color = state.isCamEnabled ? 'inherit' : 'var(--status-red)';

  updateTransmitButtonState();
}

function toggleMicrophone() {
  if (!state.localStream) return;
  const audioTrack = state.localStream.getAudioTracks()[0];
  if (audioTrack) {
    state.isMicEnabled = !state.isMicEnabled;
    audioTrack.enabled = state.isMicEnabled;
    els.micIcon.style.color = state.isMicEnabled ? 'inherit' : 'var(--status-red)';
    addLog('info', state.isMicEnabled ? 'Đã bật micrô' : 'Đã tắt micrô');
  }
}

function toggleCamera() {
  if (!state.localStream) return;
  const videoTrack = state.localStream.getVideoTracks()[0];
  if (videoTrack) {
    state.isCamEnabled = !state.isCamEnabled;
    videoTrack.enabled = state.isCamEnabled;
    els.camIcon.style.color = state.isCamEnabled ? 'inherit' : 'var(--status-red)';
    els.localVideo.style.display = state.isCamEnabled ? 'block' : 'none';
    addLog('info', state.isCamEnabled ? 'Đã bật camera' : 'Đã tắt camera');
  }
}

async function handleCallEvent(event, sender, extra) {
  if (event === 'invite') {
    if (state.callState !== 'idle') {
      // Busy
      window.lanlink.sendCallEvent({ event: 'decline', targetId: sender.id }).catch(() => { });
      return;
    }
    state.callState = 'ringing';
    state.incomingCallPayload = { sender, offer: extra.offer };
    els.incomingCallSenderName.textContent = sender.alias;
    els.incomingCallModal.classList.add('open');
    addLog('warning', `Cuộc gọi video đến từ ${sender.alias}`);
    updateCallUI();
  }
  else if (event === 'accept') {
    if (state.callState === 'calling' && state.peerConnection) {
      addLog('success', `${sender.alias} đã chấp nhận cuộc gọi.`);
      state.callState = 'connected';
      updateCallUI();
      try {
        await state.peerConnection.setRemoteDescription(new RTCSessionDescription(extra.answer));
        await drainIceCandidates();
      } catch (err) {
        addLog('error', `Lỗi thiết lập mô tả đối tác: ${err.message}`);
        hangUpCall();
      }
    }
  }
  else if (event === 'decline') {
    if (state.callState === 'calling' || state.callState === 'ringing') {
      addLog('warning', `Cuộc gọi bị từ chối bởi ${sender.alias}`);
      resetCallState();
    }
  }
  else if (event === 'hangup') {
    addLog('info', `${sender.alias} đã kết thúc cuộc gọi.`);
    resetCallState();
  }
}

async function handleSignaling(signal, senderId) {
  const isTargetPeer = senderId === state.callPeerId || (state.incomingCallPayload && senderId === state.incomingCallPayload.sender.id);
  if (!isTargetPeer) return;

  if (signal.type === 'candidate') {
    if (state.peerConnection && state.peerConnection.remoteDescription && state.peerConnection.remoteDescription.type) {
      try {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        addLog('info', 'Đã thêm ICE candidate đối tác.');
      } catch (err) {
        addLog('error', `Lỗi thêm ICE candidate đối tác: ${err.message}`);
      }
    } else {
      state.iceCandidateBuffer.push(signal.candidate);
      addLog('info', 'Đã đệm ICE candidate đối tác.');
    }
  }
}

// --- Manual Ping Diagnostics ---
let currentPingIp = null;
let pingSequenceCount = 0;

function startManualPing(ip) {
  if (!ip) return;
  currentPingIp = ip;
  pingSequenceCount = 0;

  // Open modal & Reset UI state
  els.pingModal.classList.add('open');
  els.pingModalSubtitle.textContent = `Đang khởi tạo kết nối tới ${ip}...`;
  els.pingConsole.innerHTML = `<div style="color: var(--accent-cyan); font-weight: 500;">$ ping ${ip} -c 4</div>`;
  els.pingProgressBar.style.width = '0%';
  els.pingSummary.style.display = 'none';
  els.pingRetryBtn.style.display = 'none';
  els.pingCloseBtn.disabled = true;

  addLog('info', `Đang chạy đo kiểm độ trễ thủ công tới IP: ${ip}...`);

  window.lanlink.pingPeer(ip).catch(err => {
    addPingConsoleLine(`ERROR: Lỗi khởi chạy ping: ${err.message}`);
    els.pingModalSubtitle.textContent = `Đo kiểm thất bại`;
    els.pingCloseBtn.disabled = false;
    els.pingRetryBtn.style.display = 'inline-flex';
    addLog('error', `Đo kiểm độ trễ tới ${ip} thất bại.`);
  });
}

function addPingConsoleLine(line) {
  const lineEl = document.createElement('div');
  lineEl.textContent = line;

  if (/timeout|fail|error/i.test(line)) {
    lineEl.style.color = 'var(--status-red)';
  } else if (/from|Reply/i.test(line)) {
    lineEl.style.color = 'var(--status-green)';

    // Progress increment (4 packets total)
    pingSequenceCount = Math.min(4, pingSequenceCount + 1);
    els.pingProgressBar.style.width = `${(pingSequenceCount / 4) * 100}%`;
  }

  els.pingConsole.appendChild(lineEl);
  els.pingConsole.scrollTop = els.pingConsole.scrollHeight;
}

function handlePingDone(stats) {
  els.pingProgressBar.style.width = '100%';
  els.pingModalSubtitle.textContent = `Đo kiểm hoàn tất.`;
  els.pingCloseBtn.disabled = false;
  els.pingRetryBtn.style.display = 'inline-flex';

  // Fill summary stats
  els.pingSentCount.textContent = stats.sent;
  els.pingRecvCount.textContent = stats.received;
  els.pingLostCount.textContent = stats.lost;
  els.pingLossPercent.textContent = `${stats.lossPercent}%`;

  if (stats.received > 0) {
    els.pingMinRtt.textContent = stats.min;
    els.pingMaxRtt.textContent = stats.max;
    els.pingAvgRtt.textContent = stats.avg;

    const ratingEl = els.pingSpeedRating;

    if (stats.lossPercent > 50) {
      ratingEl.style.background = 'var(--status-red-faint)';
      ratingEl.style.color = 'var(--status-red)';
      ratingEl.style.border = '1px solid var(--status-red-border)';
      ratingEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>Kết nối không ổn định (Mất gói cao: ${stats.lossPercent}%)</span>
      `;
    } else if (stats.avg < 10) {
      ratingEl.style.background = 'var(--status-green-faint)';
      ratingEl.style.color = 'var(--status-green)';
      ratingEl.style.border = '1px solid var(--status-green-border)';
      ratingEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        <span>Đường truyền cực tốt (Độ trễ thấp, kết nối tối ưu)</span>
      `;
    } else if (stats.avg < 50) {
      ratingEl.style.background = 'var(--accent-cyan-faint)';
      ratingEl.style.color = 'var(--accent-cyan)';
      ratingEl.style.border = '1px solid var(--panel-border-glow)';
      ratingEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <span>Đường truyền bình thường (Thích hợp để truyền tải)</span>
      `;
    } else {
      ratingEl.style.background = 'var(--status-amber-faint)';
      ratingEl.style.color = 'var(--status-amber)';
      ratingEl.style.border = '1px solid var(--status-amber-border)';
      ratingEl.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>Độ trễ tương đối cao (${stats.avg} ms) - Tốc độ có thể bị giới hạn</span>
      `;
    }
  } else {
    els.pingMinRtt.textContent = '-';
    els.pingMaxRtt.textContent = '-';
    els.pingAvgRtt.textContent = '-';

    const ratingEl = els.pingSpeedRating;
    ratingEl.style.background = 'var(--status-red-faint)';
    ratingEl.style.color = 'var(--status-red)';
    ratingEl.style.border = '1px solid var(--status-red-border)';
    ratingEl.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <span>Mất kết nối hoàn toàn (Mất gói 100%). Vui lòng kiểm tra lại cáp/mạng.</span>
    `;
  }

  els.pingSummary.style.display = 'block';
  addLog('success', `Đo kiểm tới ${currentPingIp} hoàn tất. Avg RTT: ${stats.avg}ms, Loss: ${stats.lossPercent}%`);
}

// --- Auto-scaling for Responsive Viewport ---
function adjustWindowScale() {
  const baseWidth = 1280; // Matches min-width of app-shell
  const baseHeight = 860; // Base height to fit all layout sections comfortably
  const winWidth = window.innerWidth;
  const winHeight = window.innerHeight;
  
  const scaleX = winWidth / baseWidth;
  const scaleY = winHeight / baseHeight;
  
  // Choose the smaller scale to ensure fit
  const scale = Math.min(scaleX, scaleY);
  
  // Constrain scale between 0.4 and 1.0 (prevent layout bloating on large monitors, while scaling down on small screens)
  const finalScale = Math.max(0.4, Math.min(scale, 1.0));
  
  console.log(`[Viewport AutoScale] Win: ${winWidth}x${winHeight}, Scale: ${scale.toFixed(3)} -> Final: ${finalScale.toFixed(3)}`);
  document.body.style.zoom = finalScale;
}

window.addEventListener('resize', adjustWindowScale);
window.addEventListener('load', adjustWindowScale);
adjustWindowScale();
