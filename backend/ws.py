# backend/ws.py
from fastapi import WebSocket, WebSocketDisconnect, APIRouter

router = APIRouter()

class ConnectionManager:
    def __init__(self):
        # {room_id: {client_id: websocket}}
        self.rooms = {}

    async def connect(self, websocket: WebSocket, client_id: str, room_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = {}
        self.rooms[room_id][client_id] = websocket

        print("Current rooms and participants:")
        for rid, clients in self.rooms.items():
            print(f"Room {rid}: {list(clients.keys())}")

    def disconnect(self, client_id: str, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].pop(client_id, None)
            if not self.rooms[room_id]:
                self.rooms.pop(room_id)

    async def send_personal_message(self, message: dict, client_id: str, room_id: str):
        websocket = self.rooms.get(room_id, {}).get(client_id)
        print("trying to send to id something")
        if websocket:
            print('yay success we did it')
            await websocket.send_json(message)

    async def broadcast(self, message: dict, room_id: str, exclude: str = None):
        if room_id not in self.rooms:
            return
        for client_id, connection in self.rooms[room_id].items():
            if client_id != exclude:
                await connection.send_json(message)

    def get_participants(self, room_id: str):
        return list(self.rooms.get(room_id, {}).keys())

manager = ConnectionManager()

@router.websocket("/ws/{room_id}/{client_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    await manager.connect(websocket, client_id, room_id)
    try:
        # Отправляем новому участнику список уже в комнате (кроме него самого)
        participants = manager.get_participants(room_id)
        await websocket.send_json({
            "type": "participants",
            "participants": [p for p in participants if p != client_id]
        })

        # Сообщаем всем в комнате о новом участнике (кроме самого нового)
        await manager.broadcast({
            "type": "new-participant",
            "from": client_id,
        }, room_id, exclude=client_id)

        while True:
            data = await websocket.receive_json()
            print(f"Received message from {client_id}: {data}")
            to = data.get("to")
            if to:
                print(f"Sending personal message to {to}")
                await manager.send_personal_message(data, to, room_id)
            else:
                print(f"Broadcasting message from {client_id}")
                await manager.broadcast(data, room_id, exclude=client_id)

    except WebSocketDisconnect:
        manager.disconnect(client_id, room_id)
        await manager.broadcast({
            "type": "leave",
            "from": client_id,
        }, room_id)
