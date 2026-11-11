function walk(components, fn, parent = null, path = []) {
  if (!Array.isArray(components)) return null;
  for (let i = 0; i < components.length; i++) {
    const node = components[i];
    const currentPath = [...path, i];
    const result = fn(node, i, components, parent, currentPath);
    if (result) return result;
    if (node && Array.isArray(node.components)) {
      const found = walk(node.components, fn, node, currentPath);
      if (found) return found;
    }
    if (node && node.type === 'section' && node.accessory) {
      const accRes = fn(node.accessory, -1, node, node, [...currentPath, 'accessory']);
      if (accRes) return accRes;
    }
  }
  return null;
}

function findNode(root, id) {
  return walk(root, (node) => (node && node._id === id ? { node } : null));
}

function findParentInfo(root, id) {
  let info = null;
  walk(root, (node, index, list, parent) => {
    if (node && node._id === id) {
      info = { node, index, list, parent };
      return info;
    }
    if (parent && parent.type === 'section' && parent.accessory && parent.accessory._id === id) {
      info = { node: parent.accessory, index: -1, list: null, parent, isAccessory: true };
      return info;
    }
    return null;
  });
  return info;
}

function removeNode(root, id) {
  const info = findParentInfo(root, id);
  if (!info) return false;
  if (info.isAccessory) return false; // accessory replaced, not removed directly except by changing
  info.list.splice(info.index, 1);
  return true;
}

function duplicateNode(root, id) {
  const info = findParentInfo(root, id);
  if (!info || info.isAccessory) return null;
  const clone = JSON.parse(JSON.stringify(info.node));
  reassignIds(clone);
  info.list.splice(info.index + 1, 0, clone);
  return clone;
}

function moveNode(root, id, direction) {
  const info = findParentInfo(root, id);
  if (!info || info.isAccessory) return false;
  const { list, index } = info;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= list.length) return false;
  const [item] = list.splice(index, 1);
  list.splice(newIndex, 0, item);
  return true;
}

function reassignIds(node) {
  const { randomUUID } = require('crypto');
  if (node && typeof node === 'object') {
    if (node._id) node._id = randomUUID().slice(0, 8);
    if (Array.isArray(node.components)) node.components.forEach(reassignIds);
    if (node.accessory) reassignIds(node.accessory);
    if (Array.isArray(node.items)) {
      // items in gallery don't need _id but harmless; keep simple
    }
  }
}

function allowedChildTypes(parentType) {
  switch (parentType) {
    case 'root':
      return ['container'];
    case 'container':
      return ['action_row', 'section', 'text_display', 'media_gallery', 'separator', 'file'];
    case 'action_row':
      return ['button', 'string_select', 'user_select', 'role_select', 'channel_select', 'mentionable_select'];
    case 'section':
      return ['text_display'];
    default:
      return [];
  }
}

module.exports = { walk, findNode, findParentInfo, removeNode, duplicateNode, moveNode, reassignIds, allowedChildTypes };
