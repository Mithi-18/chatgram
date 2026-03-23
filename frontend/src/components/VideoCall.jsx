import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';

function VideoCall({ currentUser, selectedUser, socket, isReceiving, callerSignal, callerId, onClose }) {
  const [stream, setStream] = useState(null);
  const myVideo = useRef(null);
  const userVideo = useRef(null);
  const connectionRef = useRef(null);

  useEffect(() => {
    // Get local media stream (video and audio)
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((currentStream) => {
      setStream(currentStream);
      if (myVideo.current) {
        myVideo.current.srcObject = currentStream;
      }

      // If we are initiating the call, start WebRTC right away
      if (!isReceiving) {
        initiateCall(currentStream);
      } else {
        // If receiving, answer the call
        answerCall(currentStream);
      }
    }).catch(err => {
      console.error("Failed to get local stream", err);
      alert("Could not access camera/microphone. Please ensure permissions are granted.");
      onClose();
    });

    socket.on('call_ended', () => {
      endCall(false);
    });

    return () => {
      socket.off('call_ended');
      endCall(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initiateCall = (mediaStream) => {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream: mediaStream,
    });

    peer.on('signal', (data) => {
      socket.emit('call_user', {
        userToCall: selectedUser.id,
        signalData: data,
        from: currentUser.id,
        name: currentUser.name,
      });
    });

    peer.on('stream', (userStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = userStream;
      }
    });

    socket.on('call_accepted', (signal) => {
      peer.signal(signal);
    });

    connectionRef.current = peer;
  };

  const answerCall = (mediaStream) => {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream: mediaStream,
    });

    peer.on('signal', (data) => {
      socket.emit('answer_call', { signal: data, to: callerId });
    });

    peer.on('stream', (userStream) => {
      if (userVideo.current) {
        userVideo.current.srcObject = userStream;
      }
    });

    peer.signal(callerSignal);
    connectionRef.current = peer;
  };

  const endCall = (emitEvent = true) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (connectionRef.current) {
      connectionRef.current.destroy();
    }
    if (emitEvent && selectedUser) {
      socket.emit('disconnect_call', { to: isReceiving ? callerId : selectedUser.id });
    }
    onClose();
  };

  return (
    <div className="call-overlay">
      <h2 style={{ marginBottom: '20px', zIndex: 1, textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
        {isReceiving ? `In call with ${selectedUser ? selectedUser.name : 'Unknown'}` : `Calling ${selectedUser?.name}...`}
      </h2>
      
      <div className="videos-container">
        <div className="video-frame">
          <video playsInline muted ref={myVideo} autoPlay />
          <div className="video-label">{currentUser.name} (You)</div>
        </div>
        
        <div className="video-frame">
          <video playsInline ref={userVideo} autoPlay />
          <div className="video-label">{selectedUser?.name || 'Connecting...'}</div>
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
