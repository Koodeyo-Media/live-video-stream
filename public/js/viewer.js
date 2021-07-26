const remoteContainer = document.getElementById('remote_container');
const stateSpan = document.getElementById('state_span');
let localStream = null;
let clientId = null;
let device = null;
let consumerTransport = null;
let videoConsumer = null;
let audioConsumer = null;

// =========== socket.io ========== 
let socket = null;

// return Promise
function connectSocket() {
    if (socket) {
        socket.close();
        socket = null;
        clientId = null;
    }

    return new Promise((resolve, reject) => {
        socket = io.connect('/');

        socket.on('connect', function (evt) {
            console.log('socket.io connected()');
        });
        socket.on('error', function (err) {
            console.error('socket.io ERROR:', err);
            reject(err);
        });
        socket.on('disconnect', function (evt) {
            console.log('socket.io disconnect:', evt);
        });
        socket.on('message', function (message) {
            console.log('socket.io message:', message);
            if (message.type === 'welcome') {
                if (socket.id !== message.id) {
                    console.warn('WARN: something wrong with clientID', socket.io, message.id);
                }

                clientId = message.id;
                console.log('connected to server. clientId=' + clientId);
                resolve();
            }
            else {
                console.error('UNKNOWN message from server:', message);
            }
        });
        socket.on('newProducer', async function (message) {
            console.log('socket.io newProducer:', message);
            if (consumerTransport) {
                // start consume
                if (message.kind === 'video') {
                    videoConsumer = await consumeAndResume(consumerTransport, message.kind);
                }
                else if (message.kind === 'audio') {
                    audioConsumer = await consumeAndResume(consumerTransport, message.kind);
                }
            }
        });

        socket.on('producerClosed', function (message) {
            console.log('socket.io producerClosed:', message);
            const localId = message.localId;
            const remoteId = message.remoteId;
            const kind = message.kind;
            console.log('--try removeConsumer remoteId=' + remoteId + ', localId=' + localId + ', kind=' + kind);
            if (kind === 'video') {
                if (videoConsumer) {
                    videoConsumer.close();
                    videoConsumer = null;
                }
            }
            else if (kind === 'audio') {
                if (audioConsumer) {
                    audioConsumer.close();
                    audioConsumer = null;
                }
            }

            if (remoteId) {
                removeRemoteVideo(remoteId);
            }
            else {
                removeAllRemoteVideo();
            }
        })
    });
}

// auto control video
function addRemoteTrack(id, track) {
    let video = findRemoteVideo(id);
    if (!video) {
        video = addRemoteVideo(id);
    }

    if (video.srcObject) {
        video.srcObject.addTrack(track);
        return;
    }

    const newStream = new MediaStream();
    newStream.addTrack(track);
    playVideo(video, newStream)
        .then(() => { video.volume = 1.0 })
        .catch(err => { console.error('media ERROR:', err) });
}
function addRemoteVideo(id) {
    let existElement = findRemoteVideo(id);
    if (existElement) {
        console.warn('remoteVideo element ALREADY exist for id=' + id);
        return existElement;
    }

    let element = document.createElement('video');
    remoteContainer.appendChild(element);
    element.id = 'remote_' + id;
    element.width = 240;
    element.height = 180;
    element.volume = 0;
    //element.controls = true;
    element.style = 'border: solid black 1px;';
    return element;
}
function findRemoteVideo(id) {
    let element = document.getElementById('remote_' + id);
    return element;
}
function removeRemoteVideo(id) {
    console.log(' ---- removeRemoteVideo() id=' + id);
    let element = document.getElementById('remote_' + id);
    if (element) {
        element.pause();
        element.srcObject = null;
        remoteContainer.removeChild(element);
    }
    else {
        console.log('child element NOT FOUND');
    }
}
function removeAllRemoteVideo() {
    while (remoteContainer.firstChild) {
        remoteContainer.firstChild.pause();
        remoteContainer.firstChild.srcObject = null;
        remoteContainer.removeChild(remoteContainer.firstChild);
    }
}

async function subscribe() {
    if (!isSocketConnected()) {
        connectSocket().catch(err => {
            console.error(err);
            return;
        });
        // --- get capabilities --
        const data = await sendRequest('getRouterRtpCapabilities', {});
        console.log('getRouterRtpCapabilities:', data);
        await loadDevice(data);
    }
    // --- prepare transport ---
    console.log('--- createConsumerTransport --');
    const params = await sendRequest('createConsumerTransport', {});
    console.log('transport params:', params);
    consumerTransport = device.createRecvTransport(params);
    console.log('createConsumerTransport:', consumerTransport);
}
function disconnect() {
    if (videoConsumer) {
        videoConsumer.close();
        videoConsumer = null;
    }
    if (audioConsumer) {
        audioConsumer.close();
        audioConsumer = null;
    }
    if (consumerTransport) {
        consumerTransport.close();
        consumerTransport = null;
    }

    removeAllRemoteVideo();

    disconnectSocket();
}
// auto subscribe
subscribe();