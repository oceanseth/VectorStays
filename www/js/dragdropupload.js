
let dropArea = document.getElementById('drop-area')

;['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false)
})

;['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false)
})

function highlight(e) {
    dropArea.classList.add('highlight')
}

function unhighlight(e) {
    dropArea.classList.remove('highlight')
}

;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false)
})

function preventDefaults (e) {
    e.preventDefault()
    e.stopPropagation()
}

dropArea.addEventListener('drop', handleDrop, false)

function handleDrop(e) {
    let dt = e.dataTransfer
    let files = dt.files

    handleFiles(files)
}
function handleFiles(files) {
    files = [...files]
    initializeProgress(files.length)
    files.forEach(uploadFile)
    files.forEach(previewFile)
}

function uploadFile(file) {
    let url = APIPATH;
    let formData = new FormData();

    formData.append('file', file);
    formData.append('method','uploadLogo');
    formData.append('token', user.token);
    fetch(url, {
        method: 'POST',
        body: formData
    })
        .then(progressDone)
        .catch(() => { /* Error. Inform the user */ })
}

function previewFile(file) {
    let reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onloadend = function() {
        let img = document.createElement('img')
        img.src = reader.result
        $(".logoimg").attr("src",reader.result);
        document.getElementById('gallery').appendChild(img)
    }
}

let filesDone = 0
let filesToDo = 0
let progressBar = document.getElementById('progress-bar')
function initializeProgress(numfiles) {
    progressBar.value = 0
    filesDone = 0
    filesToDo = numfiles
}

function progressDone() {
    filesDone++
    progressBar.value = filesDone / filesToDo * 100

}