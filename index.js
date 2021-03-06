fs = require('fs');
const sizeOf = require('image-size');
const { createCanvas, loadImage } = require('canvas');
const { off } = require('process');
const prompt = require('prompt-sync')();

//Config
const config = JSON.parse(fs.readFileSync('./config.json'));
if (!config) {
  console.log("Config file not foud, please make sure 'config.json' exists.");
  return;
}

const font = config.data.font;
const baseWidth = config.data.baseWidth;
const color = config.data.color;
const transparency = config.data.transparency;
const text = config.data.text;
const position = config.data.position;
const horizontalPadding = config.data.horizontalPadding;
const verticalPadding = config.data.verticalPadding;
const xOffset = config.data.xOffset;
const yOffset = config.data.yOffset;
const rotation = config.data.rotation;
const sourceDirectory = config.data.sourceDirectory;
const destinationDirectory = config.data.destinationDirectory;


if (config.resetLogs) {
  resetProgressLogs();
}
const args = process.argv.slice(2);
args.forEach(arg => {
  switch(arg) {
    case "reset":
      resetProgressLogs();
      break;
  }
});

if (config.overideFiles) {
  setFiles(config.files);
}

// Setup
let progressData = JSON.parse(fs.readFileSync('./logs.json')); 
if (progressData.filesRemaining.length <= 0 && progressData.filesDone.length <= 0) {
  progressData.filesRemaining = fs.readdirSync(`./${sourceDirectory}`);
  fs.writeFileSync('./logs.json', JSON.stringify(progressData, false, 2));
}

if (progressData.fileInProgress) {
  progressData.filesErrored.push(progressData.fileInProgress);
}

if (progressData.filesRemaining.length > 0) {
  const startTime = new Date();
  progressData.batchNo++;
  fs.writeFileSync('./logs.json', JSON.stringify(progressData, false, 2));
  processImages()
  .then(() => {
    progressData = JSON.parse(fs.readFileSync('./logs.json')); 
    console.log(`Batches taken: ${progressData.batchNo}`);
    console.log(`Items processed: ${progressData.filesDone.length}`);
    console.log(`Time of last batch ${Math.abs((new Date() - startTime) / 1000)} seconds`);
    
    if (progressData.filesErrored.length) {
      progressData.filesErrored.forEach(file => {
        console.log(`ERROR: File ${file} was skipped, please check manually`);
      });
      prompt(); 
    } else {
      prompt("Processing complete, no errors");
    }
  });
} else {
  console.log("No Files to Process");
}


async function processImages() {
  while(progressData.filesRemaining.length > 0) {

    const imageName = progressData.filesRemaining[progressData.filesRemaining.length - 1]
    const imageDestination = `./${destinationDirectory}/${imageName}`;
    const currentImageLocation = `./${sourceDirectory}/${imageName}`;

    if (fs.existsSync(currentImageLocation)) {
      const dimensions = sizeOf(currentImageLocation);
      const canvas = createCanvas(dimensions.width, dimensions.height);
      const ctx = canvas.getContext('2d');
      
      let imageFont = font;
      let padding = [horizontalPadding, verticalPadding];
      if (config.data.relativeFontSize) {
        imageFont = setFontSize(dimensions);
        padding= setPadding(dimensions);
      }

      progressData.fileInProgress = progressData.filesRemaining.pop();
      fs.writeFileSync('./logs.json', JSON.stringify(progressData, false, 2));
      
      await loadImage(currentImageLocation).
      then((image) => {
        ctx.drawImage(image, 0, 0);

        // Setup
        ctx.fillStyle = color + convertToHex(transparency);
        ctx.font = imageFont;
        
        // Transform
        const textData = ctx.measureText(text);
        const textPosition = setPosition(textData, dimensions, padding);
        rotate(ctx, textPosition, textData, dimensions);

        // Place watermark
        ctx.fillText(text,textPosition[0], textPosition[1]);
        fs.writeFileSync(imageDestination, canvas.toBuffer('image/jpeg')); 
        console.log(`${imageName} processed`);

        // Update logs
        progressData.filesDone.push(progressData.fileInProgress);
        progressData.fileInProgress = "";
        fs.writeFileSync('./logs.json', JSON.stringify(progressData, false, 2));
        console.log(`${Math.round(progressData.filesDone.length / (progressData.filesRemaining.length + progressData.filesDone.length) * 100)}% complete\n`);
      })
      .catch(error => {
        console.log(error);
      });
    } else {
      console.log(`ERROR, file ${currentImageLocation} doesn't exist\n`);
      progressData.filesErrored.push(progressData.filesRemaining.pop());
    }
  }
}

function rotate(ctx, position, textData, dimensions) {
  let rotationValue = rotation;
  if (typeof rotation === "string" && rotation.toLowerCase() == "auto") {
    rotationValue = Math.atan(dimensions.height / dimensions.width) * (180 / Math.PI);
  }

  ctx.translate(position[0] + textData.width / 2, position[1] - (textData.actualBoundingBoxAscent + textData.actualBoundingBoxDescent) / 2);
  ctx.rotate(rotationValue * Math.PI / 180);
  ctx.translate(-(position[0] + textData.width / 2), -(position[1] - (textData.actualBoundingBoxAscent + textData.actualBoundingBoxDescent) / 2));
}

function setPosition(textData, dimensions, padding) {
  const textPositions = position.split(" ");
  let ords = [(dimensions.width / 2 - textData.width / 2) + xOffset, (dimensions.height / 2 + (textData.actualBoundingBoxAscent -  textData.actualBoundingBoxDescent) / 2) + yOffset];
  textPositions.forEach(item => {
    switch (item.toLowerCase()) {
      case "center":
        break;
      case "top":
        ords[1] = 0 + textData.actualBoundingBoxAscent + yOffset + padding[1];
        break;
      case "bottom":
        ords[1] = dimensions.height - textData.actualBoundingBoxDescent - padding[1] + yOffset;
        break;
      case "left":
        ords[0] = 0 + xOffset + padding[0];
        break;
      case "right":
        ords[0] = dimensions.width - textData.width - padding[0] + xOffset;
        break;
    }
  });
  return ords;
}

function resetProgressLogs() {
  console.log("resetting logs");
  let data = {
    batchNo: 0,
    batchStartTime: 0,
    filesRemaining: [],
    filesDone: [],
    fileInProgress: "",
    filesErrored: []
  }
  fs.writeFileSync('./logs.json', JSON.stringify(data, false, 2));
}

function convertToHex(number) {
  if (number > 100 || number < 0) {
    console.log("Transparency out of bounds");
    return "00";
  } else {
    number = 100 - number;
    const normalizedValue = Math.round(number / 100 * 255);
    return normalizedValue.toString(16).length < 2 ? `0${normalizedValue.toString(16)}` : normalizedValue.toString(16);
  }
}

function setFontSize(dimentions) {
  let regex = /\D/g;
  const fontSize = font.replace(regex, "");
  const ratio = fontSize / baseWidth;
  const canvasSize = dimentions.width * ratio;

  regex = /\d+px/
  return font.replace(regex, (canvasSize | 0) + 'px');
}

function setPadding(dimentions) {
  const ratio = dimentions.width / baseWidth;
  return [horizontalPadding * ratio, verticalPadding * ratio];
}

function setFiles(files) {
  if (files) {
    files = files.map(file => {
      if (file.split(".").pop() !== "jpg") {
        return file += ".jpg";
      } else {
        return file;
      }
    });
    console.log(files);
    let data = {
      batchNo: 0,
      batchStartTime: 0,
      filesRemaining: files,
      filesDone: [],
      fileInProgress: "",
      filesErrored: []
    }
    fs.writeFileSync('./logs.json', JSON.stringify(data, false, 2));
  }
}

