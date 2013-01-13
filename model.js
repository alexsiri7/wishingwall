// Lists -- {name: String}
Lists = new Meteor.Collection("lists");
Wishes = new Meteor.Collection("wishes");

if (Meteor.isServer){
// Publish complete set of lists to all clients.
Meteor.publish('lists', function () {
  return Lists.find();
});


// Wishes -- {text: String,
//           done: Boolean,
//           tags: [String, ...],
//           list_id: String,
//           timestamp: Number}

// Publish all items for requested list_id.
Meteor.publish('wishes', function (list_id) {
  return Wishes.find({list_id: list_id});
});
}

Lists.allow({
  insert: function (userId, list) {
    return false; // no cowboy inserts -- use createList method
  },
  update: function (userId, lists){
    return false;
  },
  remove: function (userId, lists) {
    return ! _.any(lists, function (list) {
      // deny if not the owner, or if other people are going
      return list.owner !== userId;
    });
  }
});
Wishes.allow({
  insert: function (userId, wish) {
    return false; // no cowboy inserts -- use createWish method
  },
  update: function (userId, parties, fields, modifier) {
    return _.all(wishes, function (wish) {
      if (userId !== wish.owner)
        return false; // not the owner

      var allowed = ["text"];
      if (_.difference(fields, allowed).length)
        return false; // tried to write to forbidden field
      return true;
    });
  },
  remove: function (userId, wishes) {
    return ! _.any(wishes, function (wish) {
      // deny if not the owner, or if other people are going
      return wish.owner !== userId || votedup(wish) > 0;
    });
  }
});

var votedup = function (wish) {
  return wish.voters.length;
};

Meteor.methods({
  // options should include: title, description, x, y, public
  createList: function (name) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in");
    return Lists.insert({
      owner: this.userId,
      name: name,
      votes: []
    });
  },

  // options should include: title, description, x, y, public
  createWish: function (text, list_id, tags) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in");
    return Wishes.insert({
      owner: this.userId,
      text: text,
      list_id: list_id,
      tags: tags,
      votes: [],
      done: false
    });
  },

  voteup: function (wishId) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to Vote");
    var wish = 	Wishes.findOne(wishId);
    if (! wish)
      throw new Meteor.Error(404, "No such wish");
    var voteIndex = _.indexOf(wish.votes, this.userId);
    if (voteIndex == -1) {
      // add new vote
      Wishes.update(wishId,
                     {$push: {votes: this.userId}});
    }
  },
  votedown: function (wishId) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to Down Vote");
    var wish = Wishes.findOne(wishId);
    if (! wish)
      throw new Meteor.Error(404, "No such wish");
    var voteIndex = _.indexOf(wish.votes, this.userId);
    if (voteIndex !== -1) {
      // add new vote
      Wishes.update(wishId,
                     {$pop: {votes: this.userId}});
    }
  }

});

///////////////////////////////////////////////////////////////////////////////
// Users

var displayName = function (user) {
  if (user.profile && user.profile.name)
    return user.profile.name;
  return user.emails[0].address;
};

var contactEmail = function (user) {
  if (user.emails && user.emails.length)
    return user.emails[0].address;
  if (user.services && user.services.facebook && user.services.facebook.email)
    return user.services.facebook.email;
  return null;
};
