#!/usr/bin/env python3
"""
WebRTC Signaling Server using Flask-SocketIO and eventlet
"""
# Import and patch at absolute top, before anything else
import eventlet
eventlet.monkey_patch()

# Now import everything else
import os
import logging
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app():
    """Create and configure the Flask application."""
    from flask import Flask, request
    from flask_socketio import SocketIO, emit, join_room, leave_room

    load_dotenv()

    app = Flask(__name__)
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev_key')

    # Store connected users and rooms
    users = {}
    rooms = {}

    # Create SocketIO instance with eventlet async mode
    socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet', logger=True, engineio_logger=True)

    @app.route('/')
    def index():
        return 'WebRTC Signaling Server'

    @socketio.on('connect')
    def handle_connect():
        logger.info(f'Client connected: {request.sid}')
        users[request.sid] = {
            'id': request.sid,
            'room': None
        }

    @socketio.on('disconnect')
    def handle_disconnect():
        logger.info(f'Client disconnected: {request.sid}')
        user = users.get(request.sid)
        if user and user['room']:
            room_id = user['room']
            leave_room(room_id)
            if room_id in rooms and request.sid in rooms[room_id]:
                rooms[room_id].remove(request.sid)
                if not rooms[room_id]:  # Clean up empty rooms
                    del rooms[room_id]
                # Notify others
                emit('user_disconnected', {'userId': request.sid}, to=room_id)

        if request.sid in users:
            del users[request.sid]

    @socketio.on('join_room')
    def handle_join_room(data):
        room_id = data.get('roomId')
        if not room_id:
            emit('error', {'message': 'Room ID is required'})
            return

        logger.info(f'User {request.sid} joining room {room_id}')
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
        }, to=room_id, include_self=False)

        # Send current users in the room to the new user
        logger.info(f'Room users: {", ".join(rooms[room_id])}')
        emit('room_users', {
            'users': rooms[room_id],
            'userCount': len(rooms[room_id])
        })

    @socketio.on('leave_room')
    def handle_leave_room(data):
        room_id = data.get('roomId') or users.get(request.sid, {}).get('room')
        if not room_id:
            return

        logger.info(f'User {request.sid} leaving room {room_id}')
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
            logger.debug(f'Signal from {request.sid} to {target_id}')
            emit('signal', {
                'userId': request.sid,
                'signal': data.get('signal')
            }, to=target_id)
        else:
            logger.warning(f'Invalid signal target: {target_id}')

    @socketio.on('broadcast')
    def handle_broadcast(data):
        room_id = users.get(request.sid, {}).get('room')
        if room_id:
            logger.debug(f'Broadcast from {request.sid} to room {room_id}')
            emit('broadcast', {
                'userId': request.sid,
                'data': data.get('data')
            }, to=room_id, include_self=False)

    return app, socketio

def main():
    """Run the server."""
    app, socketio = create_app()

    port = int(os.getenv('PORT', 8080))
    logger.info(f'Starting server on port {port}')

    # Use eventlet's WSGI server (better for production than socketio.run)
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', port)), app, log_output=True)

if __name__ == '__main__':
    main()