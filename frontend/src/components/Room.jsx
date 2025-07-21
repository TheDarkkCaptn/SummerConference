// src/components/Room.jsx
import React, { useEffect, useRef, useState, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext.jsx';

const WS_SERVER = 'wss://192.168.0.104:8000/ws'; // ваш WS сервер

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, // публичный STUN сервер
  ],
};

const Room = () => {
  const { id: roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const localVideoRef = useRef(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // {peerId: MediaStream}
  const pcPeers = useRef({}); // {peerId: RTCPeerConnection}
  const ws = useRef(null);
  const localStream = useRef(null);
  const clientId = useRef(user.username + '_' + Math.floor(Math.random() * 10000)); // уникальный ID для WS
  const candidateBuffer = useRef({}); // { peerId: [candidate, ...] }

  const [isLocalStreamReady, setIsLocalStreamReady] = useState(false);

  useEffect(() => {
    // Получаем локальный медиапоток
    async function startLocalStream() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localStream.current = stream;
            if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            }
            setIsLocalStreamReady(true);
        } catch (e) {
            alert('Ошибка доступа к камере/микрофону: ' + e.message);
            // Instead of blocking, create an empty MediaStream to keep connection logic consistent
            localStream.current = new MediaStream();
            setIsLocalStreamReady(true);
        }
    }

    startLocalStream();
  }, []);

  useEffect(() => {
    if (!isLocalStreamReady) return;

    ws.current = new WebSocket(`${WS_SERVER}/${roomId}/${clientId.current}`);

    ws.current.onopen = () => {
        console.log('WS connected');
    };

    ws.current.onmessage = async (message) => {
        const data = JSON.parse(message.data);
        const { type, from, to, sdp, candidate, participants } = data;
        console.log('WS message received:', data);

        if (to && to !== clientId.current) return;

        switch (type) {
            case "participants":
            // Создаём соединения с уже в комнате
            for (const peerId of participants) {
                await createPeerConnection(peerId, true);
            }
            break;

            case "new-participant":
            if (from !== clientId.current) {
                await createPeerConnection(from, true);
            }
            break;

            case "offer":
                await createPeerConnection(from, false, sdp);
                console.log(`Remote description set for ${from}`);
            break;

            case "answer":
            console.log("Received answer from", from);
            if (pcPeers.current[from]) {
              console.log("Found peer connection for", from);
              try {
                await pcPeers.current[from].setRemoteDescription(new RTCSessionDescription(sdp));
                console.log(`Remote description set (answer) for ${from}`);

                if (candidateBuffer.current[from]) {
                  console.log(`Flushing ${candidateBuffer.current[from].length} buffered ICE candidates for ${from}`);
                  const bufferedCandidates = candidateBuffer.current[from];
                  console.log("Buffered candidates array:", bufferedCandidates);
                  for (let i = 0; i < bufferedCandidates.length; i++) {
                    const c = bufferedCandidates[i];
                    console.log("Adding buffered candidate:", c);
                    try {
                      await pcPeers.current[from].addIceCandidate(new RTCIceCandidate(c));
                      console.log(`Added buffered ICE candidate for ${from} after answer`);
                    } catch (e) {
                      console.error("Error adding buffered ICE candidate after answer", e);
                    }
                  }
                  candidateBuffer.current[from] = [];
                } else {
                  console.log("No buffered ICE candidates for", from);
                }
              } catch (e) {
                console.error(`Failed to set remote description (answer) for ${from}`, e);
              }
            } else {
              console.warn("No peer connection found for", from);
            }
            break;



            case "candidate":
            console.log(`Received ICE candidate from ${from}`, candidate);
            if (pcPeers.current[from]) {
              const pc = pcPeers.current[from];
              if (pc.remoteDescription && pc.remoteDescription.type) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(candidate));
                  console.log(`Added ICE candidate from ${from}`);
                } catch (e) {
                  console.error("Ошибка добавления ICE кандидата", e);
                }
              } else {
                if (!candidateBuffer.current[from]) candidateBuffer.current[from] = [];
                candidateBuffer.current[from].push(candidate);
                console.log(`Buffered ICE candidate from ${from}`);
              }
            } else {
              if (!candidateBuffer.current[from]) candidateBuffer.current[from] = [];
              candidateBuffer.current[from].push(candidate);
              console.log(`Buffered ICE candidate from ${from} (no peer connection yet)`);
            }
            break;

            case "leave":
            if (pcPeers.current[from]) {
                pcPeers.current[from].close();
                delete pcPeers.current[from];
                setRemoteStreams((streams) => {
                const newStreams = { ...streams };
                delete newStreams[from];
                return newStreams;
                });
            }
            break;
        }
    };


    ws.current.onclose = () => {
      console.log('WS disconnected');
    };

    ws.current.onerror = (e) => {
      console.error('WS error', e);
    };

    // При выходе из комнаты закрываем все соединения и WS
    return () => {
        Object.values(pcPeers.current).forEach((pc) => pc.close());
        pcPeers.current = {};
        if (ws.current) {
        ws.current.close();
        }
    };
  }, [isLocalStreamReady]);

  async function createPeerConnection(peerId, isOfferer, remoteSdp = null) {
    console.log(`Creating peer connection with ${peerId}, isOfferer: ${isOfferer}`);
    if (pcPeers.current[peerId]) {
      console.warn('Peer connection уже существует для', peerId);
      return;
    }

    const pc = new RTCPeerConnection(configuration);

    // Добавляем локальные треки
    localStream.current.getTracks().forEach((track) => {
      pc.addTrack(track, localStream.current);
    });

    // Когда получаем удалённый трек
    pc.ontrack = (event) => {
      console.log(`ontrack from ${peerId}`, event.streams);
      setRemoteStreams((streams) => {
        return { ...streams, [peerId]: event.streams[0] };
      });
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE state with ${peerId}:`, pc.iceConnectionState);
    };

    // Обработка ICE кандидатов
    pc.onicecandidate = (event) => {
      console.log('onicecandidate event:', event);
      if (event.candidate) {
        console.log('Sending ICE candidate:', event.candidate);
        ws.current.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate,
          from: clientId.current,
          to: peerId,
        }));
      }
    };

    pcPeers.current[peerId] = pc;

    if (isOfferer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ws.current.send(JSON.stringify({
        type: 'offer',
        sdp: pc.localDescription,
        from: clientId.current,
        to: peerId,
      }));
    } else {
      await pc.setRemoteDescription(new RTCSessionDescription(remoteSdp));
      console.log(`Remote description set for ${peerId}`);

      if (candidateBuffer.current[peerId]) {
        for (const c of candidateBuffer.current[peerId]) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(c));
            console.log(`Added buffered ICE candidate for ${peerId}`);
          } catch (e) {
            console.error("Ошибка добавления buffered ICE кандидата", e);
          }
        }
        candidateBuffer.current[peerId] = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ws.current.send(JSON.stringify({
        type: 'answer',
        sdp: pc.localDescription,
        from: clientId.current,
        to: peerId,
      }));
    }
  }

  const leaveRoom = () => {
    // Сообщаем всем, что уходим
    ws.current.send(JSON.stringify({ type: 'leave', from: clientId.current }));
    navigate('/profile');
  };
  
  const hasVideo = (stream) => stream && stream.getVideoTracks().length > 0;

  return (
    <div>
      <h2>Room ID: {roomId}</h2>
      <p>Welcome, {user.username}</p>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>

        <div>
        <p>Local Video</p>
        {hasVideo(localStream.current) ? (
            <video ref={localVideoRef} autoPlay muted playsInline style={{ width: 200, border: '1px solid black' }} />
        ) : (
            <div style={{ width: 200, height: 150, backgroundColor: 'black' }}></div>
        )}
        </div>

        {Object.entries(remoteStreams).map(([peerId, stream]) => {
        const videoExists = hasVideo(stream);
        return (
            <div key={peerId}>
            <p>Remote: {peerId}</p>
            {videoExists ? (
                <video
                autoPlay
                playsInline
                style={{ width: 200, border: '1px solid black' }}
                ref={(video) => {
                    if (video) video.srcObject = stream;
                }}
                />
            ) : (
                <div style={{ width: 200, height: 150, backgroundColor: 'black' }}></div>
            )}
            </div>
        );
        })}
      </div>

      <button onClick={leaveRoom} style={{ marginTop: '20px' }}>Leave Room</button>
    </div>
  );
};

export default Room;
