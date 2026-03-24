import { useEffect, useRef, useState } from 'react';

function VideoCall({ currentUser, selectedUser, socket, isReceiving, callerSignal, callerId, callType, onClose }) {
  const [stream, setStream] = useState(null);
  const myVideo = useRef(null);
  const userVideo = useRef(null);
  const peerConnectionRef = useRef(null);

  useEffect(() => {
    const getFallbackStream = (isVideo) => {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const dest = audioCtx.createMediaStreamDestination();
      const audioTrack = dest.stream.getAudioTracks()[0];
      
      if (!isVideo) return new MediaStream([audioTrack]);
      
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      let x = 0;
      setInterval(() => {
        ctx.fillStyle = '#1e2130'; ctx.fillRect(0, 0, 640, 480);
        ctx.fillStyle = '#9ca3af'; ctx.font = '24px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('Camera Disabled / Not Found', 320, 240);
        ctx.fillStyle = '#6366f1'; ctx.beginPath(); ctx.arc(x % 640, 280, 5, 0, Math.PI*2); ctx.fill();
        x += 5;
      }, 100);
      
      const videoStream = canvas.captureStream(15);
      return new MediaStream([audioTrack, videoStream.getVideoTracks()[0]]);
    };

    const startConnection = async (mediaStream) => {
      setStream(mediaStream);
      if (myVideo.current && callType === 'video') myVideo.current.srcObject = mediaStream;

      // Initialize Native WebRTC component
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      });
      peerConnectionRef.current = pc;

      mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream));

      pc.ontrack = (event) => {
        if (userVideo.current) {
          userVideo.current.srcObject = event.streams[0];
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc_ice_candidate', {
            to: isReceiving ? callerId : selectedUser.id,
            candidate: event.candidate
          });
        }
      };

      socket.on('webrtc_ice_candidate', (data) => {
        if (data.candidate && peerConnectionRef.current) {
          peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error(e));
        }
      });

      if (!isReceiving) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('call_user', {
            userToCall: selectedUser.id,
            signalData: offer,
            from: currentUser.id,
            name: currentUser.name,
            callType
          });
          
          socket.on('call_accepted', async (signal) => {
            try {
              if (peerConnectionRef.current.signalingState !== "stable") {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(signal));
              }
            } catch(e) { console.error(e) }
          });
        } catch(e) { console.error(e); }
      } else {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(callerSignal));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer_call', { signal: answer, to: callerId });
        } catch(e) { console.error(e); }
      }
    };

    navigator.mediaDevices.getUserMedia({ video: callType === 'video', audio: true })
      .then(startConnection)
      .catch(err => {
        console.warn("Failed to get local stream, switching to fallback:", err);
        try {
          const fallback = getFallbackStream(callType === 'video');
          startConnection(fallback);
        } catch (fallbackErr) {
          console.error("Fallback failed", fallbackErr);
          onClose();
        }
      });

    socket.on('call_ended', () => {
      endCall(false);
    });

    return () => {
      socket.off('call_ended');
      socket.off('call_accepted');
      socket.off('webrtc_ice_candidate');
      endCall(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endCall = (emitEvent = true) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (emitEvent && selectedUser) {
      socket.emit('disconnect_call', { to: isReceiving ? callerId : selectedUser.id });
    }
    onClose();
  };

  return (
    <div className="call-overlay">
      <h2 style={{ marginBottom: '20px', zIndex: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
        {isReceiving ? `In ${callType} call with ${selectedUser ? selectedUser.name : 'Unknown'}` : `Calling ${selectedUser?.name}...`}
      </h2>
      
      <div className={`videos-container ${callType === 'voice' ? 'voice-mode' : ''}`}>
        {callType === 'video' && (
          <div className="video-frame">
            <video playsInline muted ref={myVideo} autoPlay />
            <div className="video-label">{currentUser.name} (You)</div>
          </div>
        )}
        
        <div className={callType === 'video' ? 'video-frame' : 'voice-frame'}>
          {callType === 'video' ? (
             <video playsInline ref={userVideo} autoPlay />
          ) : (
             <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%'}}>
               <div style={{fontSize: '60px', marginBottom: '20px', animation: 'pulsate 1.5s infinite alternate'}}>📞</div>
               <h3 style={{fontSize: '24px'}}>{selectedUser?.name || 'Connecting...'}</h3>
               <audio playsInline ref={userVideo} autoPlay />
             </div>
          )}
          {callType === 'video' && <div className="video-label">{selectedUser?.name || 'Connecting...'}</div>}
        </div>
      </div>

      <div className="call-controls">
        <button className="end-call-btn" onClick={() => endCall(true)}>
          Hang Up
        </button>
      </div>
    </div>
  );
}

export default VideoCall;
