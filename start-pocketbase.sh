#!/bin/bash

# Start PocketBase with environment variables for push notifications
# Usage: ./start-pocketbase.sh

# Load environment variables from frontend/.env
if [ -f frontend/.env ]; then
  export $(grep "^VAPID_" frontend/.env | xargs)
  export $(grep "^POCKETBASE_ADMIN_" frontend/.env | xargs)
else
  echo "Warning: frontend/.env not found. Environment variables may not be configured."
fi

# Start PocketBase
cd pocketbase
./pocketbase serve
