// @flow
import type { Node } from 'react';
import * as ICONS from 'constants/icons';
import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import { regexInvalidURI } from 'util/lbryURI';
import PostEditor from 'component/postEditor';
import FileSelector from 'component/common/file-selector';
import Button from 'component/button';
import Card from 'component/common/card';
import { FormField } from 'component/common/form';
import Spinner from 'component/spinner';
import I18nMessage from 'component/i18nMessage';
import usePersistedState from 'effects/use-persisted-state';
import * as PUBLISH_MODES from 'constants/publish_types';
import PublishName from 'component/publishName';
import path from 'path';
type Props = {
  uri: ?string,
  mode: ?string,
  name: ?string,
  title: ?string,
  filePath: ?string,
  fileMimeType: ?string,
  isStillEditing: boolean,
  balance: number,
  updatePublishForm: ({}) => void,
  disabled: boolean,
  publishing: boolean,
  showToast: (string) => void,
  inProgress: boolean,
  clearPublish: () => void,
  ffmpegStatus: any,
  optimize: boolean,
  size: number,
  duration: number,
  isVid: boolean,
  subtitle: string,
  setPublishMode: (string) => void,
  setPrevFileText: (string) => void,
  header: Node,
  channelId: string,
  setWaitForFile: (boolean) => void,
};

function PublishFile(props: Props) {
  const {
    uri,
    mode,
    name,
    title,
    balance,
    filePath,
    fileMimeType,
    isStillEditing,
    updatePublishForm,
    disabled,
    publishing,
    inProgress,
    clearPublish,
    optimize,
    ffmpegStatus = {},
    size,
    duration,
    isVid,
    setPublishMode,
    setPrevFileText,
    header,
    subtitle,
  } = props;

  const RECOMMENDED_BITRATE = 6000000;

  const PROCESSING_MB_PER_SECOND = 0.5;
  const MINUTES_THRESHOLD = 30;
  const HOURS_THRESHOLD = MINUTES_THRESHOLD * 60;
  const MARKDOWN_FILE_EXTENSIONS = ['txt', 'md', 'markdown'];
  const sizeInMB = Number(size) / 1000000;
  const secondsToProcess = sizeInMB / PROCESSING_MB_PER_SECOND;
  const ffmpegAvail = ffmpegStatus.available;
  const currentFile = filePath;
  const [currentFileType, setCurrentFileType] = useState(null);
  const [optimizeAvail, setOptimizeAvail] = useState(false);
  const [userOptimize, setUserOptimize] = usePersistedState('publish-file-user-optimize', false);

  // Reset filePath if publish mode changed
  useEffect(() => {
    if (mode === PUBLISH_MODES.POST) {
      if (currentFileType !== 'text/markdown' && !isStillEditing) {
        updatePublishForm({ filePath: '' });
      }
    }
  }, [currentFileType, mode, isStillEditing, updatePublishForm]);

  // Since the filePath can be updated from outside this component
  // (for instance, when the user drags & drops a file), we need
  // to check for changes in the selected file using an effect.
  useEffect(() => {
    if (!filePath) {
      return;
    }
    async function readSelectedFileDetails() {
      // Read the file to get the file's duration (if possible)
      // and offer transcoding it.
      const result = await ipcRenderer.invoke('get-file-details-from-path', filePath);
      let file;
      if (result.buffer) {
        file = new File([result.buffer], result.name, {
          type: result.mime,
        });
      }
      const fileData: FileData = {
        path: result.path,
        name: result.name,
        mimeType: result.mime || 'application/octet-stream',
        size: result.size,
        duration: result.duration,
        file: file,
      };
      processSelectedFile(fileData);
    }
    readSelectedFileDetails();
  }, [filePath]);

  useEffect(() => {
    const isOptimizeAvail = currentFile && currentFile !== '' && isVid && ffmpegAvail;
    const finalOptimizeState = isOptimizeAvail && userOptimize;

    setOptimizeAvail(isOptimizeAvail);
    updatePublishForm({ optimize: finalOptimizeState });
  }, [currentFile, filePath, isVid, ffmpegAvail, userOptimize, updatePublishForm]);

  function updateFileInfo(duration, size, isvid) {
    updatePublishForm({ fileDur: duration, fileSize: size, fileVid: isvid });
  }

  function getBitrate(size, duration) {
    const s = Number(size);
    const d = Number(duration);
    if (s && d) {
      return (s * 8) / d;
    } else {
      return 0;
    }
  }

  function getTimeForMB(s) {
    if (s < MINUTES_THRESHOLD) {
      return Math.floor(secondsToProcess);
    } else if (s >= MINUTES_THRESHOLD && s < HOURS_THRESHOLD) {
      return Math.floor(secondsToProcess / 60);
    } else {
      return Math.floor(secondsToProcess / 60 / 60);
    }
  }

  function getUnitsForMB(s) {
    if (s < MINUTES_THRESHOLD) {
      if (secondsToProcess > 1) return __('seconds');
      return __('second');
    } else if (s >= MINUTES_THRESHOLD && s < HOURS_THRESHOLD) {
      if (Math.floor(secondsToProcess / 60) > 1) return __('minutes');
      return __('minute');
    } else {
      if (Math.floor(secondsToProcess / 3600) > 1) return __('hours');
      return __('hour');
    }
  }

  function getUploadMessage() {
    if (isVid && duration && getBitrate(size, duration) > RECOMMENDED_BITRATE) {
      return (
        <p className="help--warning">
          {__('Your video has a bitrate over 5 Mbps. We suggest transcoding to provide viewers the best experience.')}{' '}
          <Button button="link" label={__('Upload Guide')} href="https://lbry.com/faq/video-publishing-guide" />
        </p>
      );
    }

    if (isVid && !duration) {
      return (
        <p className="help--warning">
          {__(
            'Your video may not be the best format. Use MP4s in H264/AAC format and a friendly bitrate (under 5 Mbps) and resolution (720p) for more reliable streaming.'
          )}{' '}
          <Button button="link" label={__('Upload Guide')} href="https://lbry.com/faq/video-publishing-guide" />
        </p>
      );
    }

    if (!!isStillEditing && name) {
      return (
        <p className="help">
          {__("If you don't choose a file, the file from your existing claim %name% will be used", { name: name })}
        </p>
      );
    }

    if (!isStillEditing) {
      return (
        <p className="help">
          {__(
            'For video content, use MP4s in H264/AAC format and a friendly bitrate (under 5 Mbps) and resolution (720p) for more reliable streaming.'
          )}{' '}
          <Button button="link" label={__('Upload Guide')} href="https://lbry.com/faq/video-publishing-guide" />
        </p>
      );
    }
  }

  function parseName(newName) {
    let INVALID_URI_CHARS = new RegExp(regexInvalidURI, 'gu');
    return newName.replace(INVALID_URI_CHARS, '-');
  }

  function handleTitleChange(event) {
    const title = event.target.value;
    // Update title
    updatePublishForm({ title });
  }

  function handleFileReaderLoaded(event: ProgressEvent) {
    // See: https://github.com/facebook/flow/issues/3470
    if (event.target instanceof FileReader) {
      const text = event.target.result;
      updatePublishForm({ fileText: text });
      setPublishMode(PUBLISH_MODES.POST);
    }
  }

  function processSelectedFile(fileData: FileData, clearName = true) {
    window.URL = window.URL || window.webkitURL;

    // select file, start to select a new one, then cancel
    if (!fileData || fileData.error) {
      if (isStillEditing || !clearName) {
        updatePublishForm({ filePath: '' });
      } else {
        updatePublishForm({ filePath: '', name: '' });
      }
      return;
    }

    // if video, extract duration so we can warn about bitrate if (typeof file !== 'string')
    const file = fileData.file;
    // Check to see if it's a video and if mp4
    const contentType = fileData.mimeType && fileData.mimeType.split('/'); // get this from electron side
    const duration = fileData.duration;
    const size = fileData.size;
    const isVideo = contentType && contentType[0] === 'video';
    const isMp4 = contentType && contentType[1] === 'mp4';

    let isTextPost = false;

    if (contentType && contentType[0] === 'text') {
      isTextPost = contentType[1] === 'plain' || contentType[1] === 'markdown';
      setCurrentFileType(contentType.join('/'));
    } else if (path.parse(fileData.path).ext) {
      // If user's machine is missing a valid content type registration
      // for markdown content: text/markdown, file extension will be used instead
      const extension = path.parse(fileData.path).ext;
      isTextPost = MARKDOWN_FILE_EXTENSIONS.includes(extension);
    }

    if (isVideo) {
      if (isMp4) {
        updateFileInfo(duration || 0, size, isVideo);
      } else {
        updateFileInfo(duration || 0, size, isVideo);
      }
    } else {
      updateFileInfo(0, size, isVideo);
    }

    if (isTextPost && file) {
      // Create reader
      const reader = new FileReader();
      // Handler for file reader
      reader.addEventListener('load', handleFileReaderLoaded);
      // Read file contents
      reader.readAsText(file);
      setCurrentFileType('text/markdown');
    } else {
      setPublishMode(PUBLISH_MODES.FILE);
    }

    // Strip off extension and replace invalid characters
    if (!isStillEditing) {
      const fileWithoutExtension = path.parse(fileData.path).name;
      updatePublishForm({ name: parseName(fileWithoutExtension) });
    }
  }

  function handleFileChange(fileWithPath: FileWithPath) {
    if (fileWithPath) {
      updatePublishForm({ filePath: fileWithPath.path });
    }
  }

  const showFileUpload = mode === PUBLISH_MODES.FILE;
  const isPublishPost = mode === PUBLISH_MODES.POST;

  return (
    <Card
      className={disabled || balance === 0 ? 'card--disabled' : ''}
      title={
        <div>
          {header} {/* display mode buttons from parent */}
          {publishing && <Spinner type={'small'} />}
          {inProgress && (
            <div>
              <Button
                button="close"
                label={__('New --[clears Publish Form]--')}
                icon={ICONS.REFRESH}
                onClick={clearPublish}
              />
            </div>
          )}
        </div>
      }
      subtitle={subtitle || (isStillEditing && __('You are currently editing your upload.'))}
      actions={
        <React.Fragment>
          <PublishName uri={uri} />
          <FormField
            type="text"
            name="content_title"
            label={__('Title')}
            placeholder={__('Descriptive titles work best')}
            disabled={disabled}
            value={title}
            onChange={handleTitleChange}
          />
          {showFileUpload && (
            <>
              <FileSelector
                type="openFile"
                label={__('File')}
                disabled={disabled}
                currentPath={currentFile}
                onFileChosen={handleFileChange}
                // https://stackoverflow.com/questions/19107685/safari-input-type-file-accept-video-ignores-mp4-files
                placeholder={__('Select file to upload')}
                readFile={false}
              />
              {getUploadMessage()}
            </>
          )}
          {showFileUpload && (
            <FormField
              type="checkbox"
              checked={userOptimize}
              disabled={!optimizeAvail}
              onChange={() => setUserOptimize(!userOptimize)}
              label={__('Optimize and transcode video')}
              name="optimize"
            />
          )}
          {showFileUpload && !ffmpegAvail && (
            <p className="help">
              <I18nMessage
                tokens={{
                  settings_link: <Button button="link" navigate="/$/settings" label={__('Settings')} />,
                }}
              >
                FFmpeg not configured. More in %settings_link%.
              </I18nMessage>
            </p>
          )}
          {showFileUpload && Boolean(size) && ffmpegAvail && optimize && isVid && (
            <p className="help">
              <I18nMessage
                tokens={{
                  size: Math.ceil(sizeInMB),
                  processTime: getTimeForMB(sizeInMB),
                  units: getUnitsForMB(sizeInMB),
                }}
              >
                Transcoding this %size% MB file should take under %processTime% %units%.
              </I18nMessage>
            </p>
          )}
          {isPublishPost && (
            <PostEditor
              label={__('Post --[noun, markdown post tab button]--')}
              uri={uri}
              disabled={disabled}
              fileMimeType={fileMimeType}
              setPrevFileText={setPrevFileText}
              setCurrentFileType={setCurrentFileType}
            />
          )}
        </React.Fragment>
      }
    />
  );
}

export default PublishFile;
