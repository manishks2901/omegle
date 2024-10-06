import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Socket, io } from "socket.io-client";

const URL = "http://localhost:3000";

export const Room = ({
    name,
    localAudioTrack,
    localVideoTrack
}: {
    name: string,
    localAudioTrack: MediaStreamTrack | null,
    localVideoTrack: MediaStreamTrack | null,
}) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [lobby, setLobby] = useState(true);
    const [socket, setSocket] = useState<null | Socket>(null);
    const [sendingPc, setSendingPc] = useState<null | RTCPeerConnection>(null);
    const [receivingPc, setReceivingPc] = useState<null | RTCPeerConnection>(null);
    const [remoteVideoTrack, setRemoteVideoTrack] = useState<MediaStreamTrack | null>(null);
    const [remoteAudioTrack, setRemoteAudioTrack] = useState<MediaStreamTrack | null>(null);
    const [remoteMediaStream, setRemoteMediaStream] = useState<MediaStream | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const socket = io(URL);
        socket.on('send-offer', async ({ roomId }) => {
            console.log("sending offer");
            setLobby(false);
            const pc = new RTCPeerConnection();

            setSendingPc(pc);
            if (localVideoTrack) {
                console.log("added track", localVideoTrack);
                pc.addTrack(localVideoTrack);
            }
            if (localAudioTrack) {
                console.log("added track", localAudioTrack);
                pc.addTrack(localAudioTrack);
            }

            pc.onicecandidate = async (e) => {
                console.log("receiving ice candidate locally");
                if (e.candidate) {
                    socket.emit("add-ice-candidate", {
                        candidate: e.candidate,
                        type: "sender",
                        roomId
                    });
                }
            };

            pc.onnegotiationneeded = async () => {
                console.log("on negotiation needed, sending offer");
                const sdp = await pc.createOffer();
                pc.setLocalDescription(sdp);
                socket.emit("offer", { sdp, roomId });
            };
        });

        socket.on("offer", async ({ roomId, sdp: remoteSdp }) => {
            console.log("received offer");
            setLobby(false);
            const pc = new RTCPeerConnection();
            pc.setRemoteDescription(remoteSdp);
            const sdp = await pc.createAnswer();
            pc.setLocalDescription(sdp);
            const stream = new MediaStream();
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = stream;
            }

            setRemoteMediaStream(stream);
            setReceivingPc(pc);
            pc.ontrack = () => {
                alert("ontrack");
            };

            pc.onicecandidate = async (e) => {
                if (e.candidate) {
                    socket.emit("add-ice-candidate", {
                        candidate: e.candidate,
                        type: "receiver",
                        roomId
                    });
                }
            };

            socket.emit("answer", { roomId, sdp });

            setTimeout(() => {
                const transceivers = pc.getTransceivers();
                if (transceivers.length >= 2) {
                    const track1 = transceivers[0].receiver.track;
                    const track2 = transceivers[1].receiver.track;
                    if (track1.kind === "video") {
                        setRemoteAudioTrack(track2);
                        setRemoteVideoTrack(track1);
                    } else {
                        setRemoteAudioTrack(track1);
                        setRemoteVideoTrack(track2);
                    }

                    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
                        //@ts-ignore
                        remoteVideoRef.current.srcObject.addTrack(track1);
                        //@ts-ignore
                        remoteVideoRef.current.srcObject.addTrack(track2);
                        //@ts-ignore
                        remoteVideoRef.current.play();
                    } else {
                        console.error("remoteVideoRef srcObject is not ready");
                    }
                } else {
                    console.error("Not enough transceivers");
                }
            }, 5000);
        });

        socket.on("answer", ({ roomId, sdp: remoteSdp }) => {
            setLobby(false);
            setSendingPc(pc => {
                if (pc) {
                    let id = roomId
                    pc.setRemoteDescription(remoteSdp);
                } else {
                    console.error("Sending PeerConnection not initialized");
                }
                return pc;
            });
            console.log("loop closed");
        });

        socket.on("lobby", () => {
            setLobby(true);
        });

        socket.on("add-ice-candidate", ({ candidate, type }) => {
            console.log("add ice candidate from remote", { candidate, type });
            if (type === "sender") {
                setReceivingPc(pc => {
                    if (pc) {
                        pc.addIceCandidate(candidate);
                    } else {
                        console.error("Receiving PeerConnection not found");
                    }
                    return pc;
                });
            } else {
                setSendingPc(pc => {
                    if (pc) {
                        pc.addIceCandidate(candidate);
                    } else {
                        console.error("Sending PeerConnection not found");
                    }
                    return pc;
                });
            }
        });

        setSocket(socket);

        return () => {
            socket.disconnect();
            if (sendingPc) sendingPc.close();
            if (receivingPc) receivingPc.close();
        };
    }, [name]);

    useEffect(() => {
        if (localVideoRef.current && localVideoTrack) {
            localVideoRef.current.srcObject = new MediaStream([localVideoTrack]);
            localVideoRef.current.play();
        }
    }, [localVideoTrack]);

    return (
        <div>
            Hi {name}
            <video autoPlay width={400} height={400} ref={localVideoRef} />
            {lobby ? "Waiting to connect you to someone" : null}
            <video autoPlay width={400} height={400} ref={remoteVideoRef} />
        </div>
    );
};
