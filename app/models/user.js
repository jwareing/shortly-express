var db = require('../config');
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');



var User = db.Model.extend({
  tableName: 'users',
  hasTimestamps: false,
  initialize: function() {
    this.on('creating', function(model, attrs, options){
      var salt = bcrypt.genSaltSync(10);
      console.log(salt);
      var hash = bcrypt.hashSync(model.get('password'), salt);
      model.set('password', hash);
      model.set('salt',salt);
    });
  },
  checkPassword: function(password){
    var salt = this.get('salt');
    var hash = bcrypt.hashSync(password, salt);
    return hash === this.get('password');
  }
});

module.exports = User;