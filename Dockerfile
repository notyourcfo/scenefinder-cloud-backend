FROM node:22
RUN apt-get update && apt-get install -y ffmpeg python3 python3-venv python3-pip
WORKDIR /app
RUN python3 -m venv /app/venv
RUN /app/venv/bin/pip install instagrapi Pillow>=8.1.1
COPY package*.json ./
RUN npm install
COPY . .
ENV PATH="/app/venv/bin:$PATH"
ENV PORT=8080
# Explicitly reset ENTRYPOINT to avoid inherited scripts
ENTRYPOINT []
EXPOSE 8080
CMD ["node", "server.js"]