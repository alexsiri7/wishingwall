// Lists -- {name: String}

//Meteor.WrappedCollection = _.extend(Meteor.Collection);

_.extend(Meteor.Collection.prototype, {
  findOneWrapped: function (){
    var self = this;
    return new self.item_class(self._collection.findOne.apply(self._collection, _.toArray(arguments)))
  },
  findWrapped: function (){
    var self = this;
    return self._collection.find.apply(self._collection, _.toArray(arguments))    
       .map(function(data){
		return new self.item_class(data);
       });
  },
  register: function (cls){
    this.item_class=cls;
  }
});

Lists = new Meteor.Collection("lists");
Wishes = new Meteor.Collection("wishes");

var Wish = function (data) {_.extend(this, data)};
var List = function (data) {_.extend(this, data)};
_.extend(List.prototype,{
	belongsTo: function (userId){
		return this.owner == userId;
	}
});

Lists.register(List);
Wishes.register(Wish);

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
    return ! _.any(lists, function (list) {
      // deny if not the owner
      return list.owner !== userId;
    });
  },
  remove: function (userId, lists) {
    return ! _.any(lists, function (list) {
      // deny if not the owner
      return !list.belongsTo(userId)
    });
  }
});
Wishes.allow({
  insert: function (userId, wish) {
    return false; // no cowboy inserts -- use createWish method
  },
  update: function (userId, wishes, fields, modifier) {
    return _.all(wishes, function (wish) {
      var public_allowed = ["tags"];
      if (_.difference(fields, public_allowed).length==0)
	return true; //Allow everyone to change public fields
      if (userId !== wish.owner)
        return false; // not the owner

      var allowed = ["done"];
      if (_.difference(fields, allowed).length)
        return false; // tried to write to forbidden field
      return true;
    });
  },
  remove: function (userId, wishes) {
    return ! _.any(wishes, function (wish) {
      // deny if not the owner, or if other people are going
      return wish.owner !== userId || wish.votes.length > 0;
    });
  }
});

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
    return Wishes.insert(new Wish({
      owner: this.userId,
      text: text,
      list_id: list_id,
      tags: tags,
      votes: [],
      done: false
    }));
  },

  voteup: function (wishId) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to Vote");
    var wish = 	Wishes.findOne(wishId);
    if (! wish)
      throw new Meteor.Error(404, "No such wish");
    var voteIndex = _.indexOf(wish.votes, this.userId);
    if (voteIndex == -1) {
      if (Wishes.find({votes: this.userId, list_id: wish.list_id}).count()>=5){
        throw new Meteor.Error(403, "You can't do any more votes");
      }

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
