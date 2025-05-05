from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev_key')
socketio = SocketIO(app, cors_allowed_origins='*')

# Store connected users
users = {}
# Store active rooms
rooms = {}

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')
    users[request.sid] = {
        'id': request.sid,
        'room': None
    }

@socketio.on('disconnect')
def handle_disconnect():
    print(f'Client disconnected: {request.sid}')
    user = users.get(request.sid)
    if user and user['room']:
        leave_room(user['room'])
        rooms.setdefault(user['room'], []).remove(request.sid)
        emit('user_disconnected', {'userId': request.sid}, to=user['room'])

    if request.sid in users:
        del users[request.sid]

@socketio.on('join_room')
def handle_join_room(data):
    room_id = data.get('roomId')
    if not room_id:
        emit('error', {'message': 'Room ID is required'})
        return

    # Join the room
    join_room(room_id)
    users[request.sid]['room'] = room_id

    # Add user to room
    if room_id not in rooms:
        rooms[room_id] = []
    rooms[room_id].append(request.sid)

    # Notify others in the room
    emit('user_joined', {
        'userId': request.sid,
        'userCount': len(rooms[room_id])
    }, to=room_id)

    # Send current users in the room to the new user
    emit('room_users', {
        'users': rooms[room_id],
        'userCount': len(rooms[room_id])
    })

@socketio.on('leave_room')
def handle_leave_room(data):
    room_id = data.get('roomId') or users[request.sid].get('room')
    if not room_id:
        return

    leave_room(room_id)
    users[request.sid]['room'] = None

    if room_id in rooms and request.sid in rooms[room_id]:
        rooms[room_id].remove(request.sid)

        # Notify others
        emit('user_left', {'userId': request.sid}, to=room_id)

        # Clean up empty rooms
        if len(rooms[room_id]) == 0:
            del rooms[room_id]

@socketio.on('signal')
def handle_signal(data):
    target_id = data.get('targetId')
    if target_id and target_id in users:
        emit('signal', {
            'userId': request.sid,
            'signal': data.get('signal')
        }, to=target_id)

@socketio.on('broadcast')
def handle_broadcast(data):
    room_id = users[request.sid].get('room')
    if room_id:
        emit('broadcast', {
            'userId': request.sid,
            'data': data.get('data')
        }, to=room_id, include_self=False)

@app.route('/')
def index():
    return 'WebRTC Signaling Server'

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    socketio.run(app, host='0.0.0.0', port=port, debug=True)