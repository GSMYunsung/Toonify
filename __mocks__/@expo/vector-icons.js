const React = require('react');
const { Text } = require('react-native');

const Icon = ({ name, size, color, style }) =>
  React.createElement(Text, { style }, name);

module.exports = {
  Feather: Icon,
  Ionicons: Icon,
  MaterialIcons: Icon,
  AntDesign: Icon,
};
