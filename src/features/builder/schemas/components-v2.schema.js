const { randomUUID } = require('crypto');

function uid() {
  return randomUUID().slice(0, 8);
}

function createTextDisplay(content = 'New text') {
  return { _id: uid(), type: 'text_display', content };
}

function createSeparator(spacing = 1, divider = true) {
  return { _id: uid(), type: 'separator', spacing, divider };
}

function createButton(label = 'Button') {
  return {
    _id: uid(),
    type: 'button',
    label,
    style: 1,
    custom_id: '',
    url: '',
    emoji: '',
    disabled: false,
    action: { type: 'ephemeral', value: 'Button pressed.' }
  };
}

function createActionRow() {
  return { _id: uid(), type: 'action_row', components: [createButton()] };
}

function createSection() {
  return {
    _id: uid(),
    type: 'section',
    components: [createTextDisplay('Section text')],
    accessory: { _id: uid(), type: 'thumbnail', url: '' }
  };
}

function createThumbnail(url = '') {
  return { _id: uid(), type: 'thumbnail', url, description: '', spoiler: false };
}

function createMediaGallery() {
  return {
    _id: uid(),
    type: 'media_gallery',
    items: [{ url: '', description: '', spoiler: false }]
  };
}

function createFile(file = '') {
  return { _id: uid(), type: 'file', file, spoiler: false };
}

function createSelectMenu(selectType = 'string_select') {
  const base = {
    _id: uid(),
    type: selectType,
    custom_id: '',
    placeholder: 'Select an option',
    min_values: 1,
    max_values: 1,
    disabled: false
  };
  if (selectType === 'string_select') {
    base.options = [{ label: 'Option 1', value: 'option_1', description: '', emoji: '', default: false }];
  }
  return base;
}

function createContainer() {
  return {
    _id: uid(),
    type: 'container',
    accent_color: null,
    spoiler: false,
    components: [createTextDisplay('New container')]
  };
}

function createDefaultComponentsV2State() {
  return {
    type: 'components_v2',
    content: '',
    root: [createContainer()]
  };
}

const COMPONENT_FACTORIES = {
  container: createContainer,
  section: createSection,
  separator: createSeparator,
  action_row: createActionRow,
  text_display: createTextDisplay,
  thumbnail: createThumbnail,
  media_gallery: createMediaGallery,
  file: createFile,
  button: createButton,
  string_select: () => createSelectMenu('string_select'),
  user_select: () => createSelectMenu('user_select'),
  role_select: () => createSelectMenu('role_select'),
  channel_select: () => createSelectMenu('channel_select'),
  mentionable_select: () => createSelectMenu('mentionable_select')
};

module.exports = {
  uid,
  createDefaultComponentsV2State,
  COMPONENT_FACTORIES,
  createTextDisplay,
  createSeparator,
  createButton,
  createActionRow,
  createSection,
  createThumbnail,
  createMediaGallery,
  createFile,
  createSelectMenu,
  createContainer
};
