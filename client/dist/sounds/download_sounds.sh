#!/bin/bash

# Download royalty-free sound effects for the Badam Satti card game
# These are from Pixabay and other CC0 sources

echo "Downloading royalty-free game sound effects..."

# Create sounds directory if it doesn't exist
mkdir -p /Users/aakash/expts/badam7/client/public/sounds

# Navigate to sounds directory
cd /Users/aakash/expts/badam7/client/public/sounds

# Download sounds from Pixabay (CC0 license - no attribution required)
echo "Downloading card shuffle sound..."
curl -L -o card-played.mp3 "https://pixabay.com/sound-effects/search/card/"

echo "Downloading success sound..."
curl -L -o game-start.mp3 "https://pixabay.com/sound-effects/search/success/"

echo "Downloading completion sound..."
curl -L -o game-end.mp3 "https://pixabay.com/sound-effects/search/achievement/"

echo "Downloading pass sound..."
curl -L -o pass-turn.mp3 "https://pixabay.com/sound-effects/search/notification/"

echo "Downloading warning sound..."
curl -L -o warning.mp3 "https://pixabay.com/sound-effects/search/warning/"

echo "Downloading alert sound..."
curl -L -o sure.mp3 "https://pixabay.com/sound-effects/search/alert/"

echo "Sound download complete!"
echo "Note: You may need to manually download these files from:"
echo "- https://pixabay.com/sound-effects/search/card/"
echo "- https://pixabay.com/sound-effects/search/success/"
echo "- https://pixabay.com/sound-effects/search/achievement/"
echo "- https://pixabay.com/sound-effects/search/notification/"
echo "- https://pixabay.com/sound-effects/search/warning/"
echo "- https://pixabay.com/sound-effects/search/alert/"
echo ""
echo "Save them as:"
echo "- card-played.mp3"
echo "- game-start.mp3"
echo "- game-end.mp3"
echo "- pass-turn.mp3"
echo "- warning.mp3"
echo "- sure.mp3"