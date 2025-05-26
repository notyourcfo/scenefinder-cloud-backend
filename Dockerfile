FROM node:22
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip
RUN pip3 install instagrapi
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
