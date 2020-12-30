let getUserMediaDevices;

(function() {
  /** @type {SocketIOClient.Socket} */
  const socket = io.connect(window.location.origin);
  let localVideo = null;
  const remoteVideos = document.querySelector('.remoteVideos');
  const peerConnections = {};
  
  let room = !location.pathname.substring(1) ? 'home' : location.pathname.substring(1);
  let getUserMediaAttempts = 5;
  let gettingUserMedia = false;

  /** @type {RTCConfiguration} */
  const config = {
    'iceServers': [{
      'urls': ['stun:stun.l.google.com:19302']
    }]
  };

  /** @type {MediaStreamConstraints} */
  const constraints = {
    audio: true,
    video: true
  };

  socket.on('full', function(room) {
    alert('Room ' + room + ' is full');
  });

  socket.on('bye', function(id) {
    handleRemoteHangup(id);
  });

  if (room && !!room) {
    socket.emit('join', room);
  }

  window.onunload = window.onbeforeunload = function() {
    socket.close();
  };

  getUserMediaDevices = function () {
    if (!gettingUserMedia && !localVideo) {
        gettingUserMedia = true;
        navigator.mediaDevices.getDisplayMedia(constraints)
        .then(getUserMediaSuccess)
        .catch(getUserMediaError);
    }
  }

  socket.on('ready', function (id) {
    if (!localVideo) {
      return;
    }
    const peerConnection = new RTCPeerConnection(config);
    peerConnections[id] = peerConnection;
    peerConnection.addStream(localVideo);
    console.log('create offer')
    peerConnection.createOffer()
    .then(sdp => {
      console.log('set offer')
      return peerConnection.setLocalDescription(sdp)
    })
    .then(function () {
      console.log('send offer')
      socket.emit('offer', id, peerConnection.localDescription);
    });
    peerConnection.onaddstream = event => handleRemoteStreamAdded(event.stream, id);
    peerConnection.onicecandidate = function(event) {
      if (event.candidate) {
        console.log('send candidate')
        socket.emit('candidate', id, event.candidate);
      }
    };
  });
  
  socket.on('offer', function(id, description) {
    const peerConnection = new RTCPeerConnection(config);
    peerConnections[id] = peerConnection;
    peerConnection.addStream(localVideo);
    console.log('set remote')
    peerConnection.setRemoteDescription(description)
    .then(() => {
      console.log('create answer')
      return peerConnection.createAnswer()
    })
    .then(sdp => {
      console.log('set answer')
      return peerConnection.setLocalDescription(sdp)
    })
    .then(function () {
      console.log('send answer')
      socket.emit('answer', id, peerConnection.localDescription);
    });
    peerConnection.onaddstream = event => handleRemoteStreamAdded(event.stream, id);
    peerConnection.onicecandidate = function(event) {
      if (event.candidate) {
        console.log('send candidate')
        socket.emit('candidate', id, event.candidate);
      }
    };
  });
  
  socket.on('candidate', function(id, candidate) {
    console.log('add candidate')
    peerConnections[id].addIceCandidate(new RTCIceCandidate(candidate))
    .catch(e => console.error(e));
  });
  
  socket.on('answer', function(id, description) {
    console.log('set remote 2')
    peerConnections[id].setRemoteDescription(description);
  });

  function getUserMediaSuccess(stream) {
    gettingUserMedia = false;
    localVideo = stream;
    socket.emit('ready');
  }

  function handleRemoteStreamAdded(stream, id) {
    const remoteVideo = document.createElement('video');
    remoteVideo.srcObject = stream;
    remoteVideo.setAttribute("id", id.replace(/[^a-zA-Z]+/g, "").toLowerCase());
    remoteVideo.setAttribute("playsinline", "true");
    remoteVideo.setAttribute("autoplay", "true");
    remoteVideos.appendChild(remoteVideo);
    if (remoteVideos.querySelectorAll("video").length === 1) {
      remoteVideos.setAttribute("class", "one remoteVideos");
    } else {
      remoteVideos.setAttribute("class", "remoteVideos");
    }
  }

  function getUserMediaError(error) {
    console.error(error);
    gettingUserMedia = false;
    (--getUserMediaAttempts > 0) && setTimeout(getUserMediaDevices, 1000);
  }

  function handleRemoteHangup(id) {
    peerConnections[id] && peerConnections[id].close();
    delete peerConnections[id];
    document.querySelector("#" + id.replace(/[^a-zA-Z]+/g, "").toLowerCase()).remove();
    if (remoteVideos.querySelectorAll("video").length === 1) {
      remoteVideos.setAttribute("class", "one remoteVideos");
    } else {
      remoteVideos.setAttribute("class", "remoteVideos");
    }
  }

})();