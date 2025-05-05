import eventlet
# Required for eventlet production server - MUST be called first!
eventlet.monkey_patch()

from flask import Flask, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
# Use an environment variable for the secret key in production
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'development-key')

# Specify async_mode='eventlet' for production
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='eventlet')

# Basic room and user management (replace with more robust logic if needed)
rooms = {}
users = {}

@socketio.on('connect')
def on_connect():
    users[request.sid] = {'room': None}
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def on_disconnect():
    user = users.pop(request.sid, None)
    if user and user['room']:
        room_id = user['room']
        leave_room(room_id)
        if room_id in rooms and request.sid in rooms[room_id]:
            rooms[room_id].remove(request.sid)
            if not rooms[room_id]: # Clean up empty room
                del rooms[room_id]
            # Notify others
            emit('user_left', {'userId': request.sid}, to=room_id)
    print(f'Client disconnected: {request.sid}')


@socketio.on('join_room')
def handle_join_room(data):
    room_id = data.get('roomId')
    if not room_id: return # Handle error

    join_room(room_id)
    users[request.sid]['room'] = room_id

    # Add user to room list
    if room_id not in rooms: rooms[room_id] = []
    rooms[room_id].append(request.sid)

    # Send current users to new joiner
    emit('room_users', {'users': rooms[room_id]})

    # Notify others in the room
    emit('user_joined', {'userId': request.sid}, to=room_id, include_self=False)

@socketio.on('signal')
def handle_signal(data):
    target_id = data.get('targetId')
    if target_id:
        # Relay WebRTC signaling data between specific peers
        emit('signal', {'userId': request.sid, 'signal': data.get('signal')}, to=target_id)

@socketio.on('broadcast')
def handle_broadcast(data):
    room_id = users.get(request.sid, {}).get('room')
    if room_id:
        emit('broadcast', {'userId': request.sid, 'data': data.get('data')}, to=room_id, include_self=False)

@app.route('/')
def index():
    return 'WebRTC Signaling Server'

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    print(f"Starting server on port {port}")
    # Use eventlet WSGI server for production
    # socketio.run(app, ...) is only for development
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', port)), app)