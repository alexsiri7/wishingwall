// Lists -- {name: String}

//Meteor.WrappedCollection = _.extend(Meteor.Collection);

_.extend(Meteor.Collection.prototype, {
  item_class: null,
  findOneWrapped: function (){
    var self = this;
    return new self.item_class(self._collection.findOne.apply(self._collection, _.toArray(arguments)))
  },
  findWrapped: function (){
    var self = this;
    var col = new LocalCollection;
    col.docs = (self.find.apply(self, _.toArray(arguments))    
       .map(function(data){
		return new self.item_class(data);
       }));
    return new LocalCollection.Cursor(col, {});
  },
  register: function (cls){
    this.item_class=cls;
  }
});

Lists = new Meteor.Collection("lists");
Wishes = new Meteor.Collection("wishes");
ListUser = new Meteor.Collection("list_user");

Meteor.Model = Backbone.Model.extend({
        initialize: function (data){
		_.extend(this, data);
	},					
	belongsTo: function (userId){
		return this.owner == userId;
	}
});

var Wish = Meteor.Model.extend({
        canBeDeleted: function (userId){
		return this.belongsTo(userId) && !this.hasVotes();
	},
	hasVotes: function (){
           return this.getVotesCount() > 0;
        },
	getVotesCount: function (){
           return this.votes.length;
        },
        getCommentsCount: function (){
           return this.comments.length;
        },
        hasAsVoter: function (userId){
           return _.indexOf(this.votes, userId)!==-1;
        },
	list: function (){
	   return Lists.findOneWrapped(this.list_id);
	},
	isOpen: function(){
		return !this.done;
	}
});
var List = Meteor.Model.extend({
    maximum_votes_per_user: 5,
    getCastVotes: function (userId){
       var total_count = 0;

       Wishes.find({votes: userId, list_id: this._id, done: false}).forEach(function (wish) {
         _.each(wish.votes, function (u) {if (u==userId) total_count++});
       });
       return total_count;
    },
    hasRemainingVotes: function (userId){
       return this.getRemainingVotes(userId)>0;
    },
    getRemainingVotes: function (userId){
       return this.maximum_votes_per_user-this.getCastVotes(userId);
    },
    getSponsorName: function (){
	return showUserName(this.owner)
    }
});

function showUserName(userId){
      var user = Meteor.users.findOne(userId);
      var name="Anonymous";
      if (!user) return name;
      if (user.profile && user.profile.name){
	name = user.profile.name;  
      } else if (user.username){
	name = user.username;  
      } else if ( user.emails &&  user.emails[0]){
	name = user.emails[0].address;  
      }
      return name;
}

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
Meteor.publish(null, function (list_id) {
  return Meteor.users.find({}, {username:1, profile:1});
});
}

Lists.allow({
  insert: function (userId, list) {
    return false; // no cowboy inserts -- use createList method
  },
  update: function (userId, lists){
    return ! _.any(lists, function (list) {
      // deny if not the owner
      return !new List(list).belongsTo(userId)
    });
  },
  remove: function (userId, lists) {
    return ! _.any(lists, function (list) {
      // deny if not the owner
      return !new List(list).belongsTo(userId)
    });
  }
});
Wishes.allow({
  insert: function (userId, wish) {
    return false; // no cowboy inserts -- use createWish method
  },
  update: function (userId, wishes, fields, modifier) {
    return _.all(wishes, function (wishData) {
      var public_allowed = ["tags"];
      if (_.difference(fields, public_allowed).length==0)
	return true; //Allow everyone to change public fields
      var wish = new Wish(wishData);
      if (!wish.belongsTo(userId))
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
      return !new Wish(wish).belongsTo(userId) || new Wish(wish).hasVotes();
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
      comments: [],
      done: false
    }));
  },

  voteup: function (wishId) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to Vote");
    var wish = 	Wishes.findOneWrapped(wishId);
    if (! wish)
      throw new Meteor.Error(404, "No such wish");
      if (!wish.list().hasRemainingVotes(this.userId)){
        throw new Meteor.Error(403, "You can't do any more votes");
      }

      // add new vote
      Wishes.update(wishId,
                     {$push: {votes: this.userId}});
  },
  votedown: function (wishId) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to Down Vote");
    var wish = Wishes.findOneWrapped(wishId);
    if (! wish)
      throw new Meteor.Error(404, "No such wish");
    var isVoter = wish.hasAsVoter(this.userId);
    if (isVoter) {
      // add new vote
      Wishes.update(wishId,
                     {$pop: {votes: this.userId}});
    }
  },
  complete: function (wishId, value) {
    if (! this.userId)
      throw new Meteor.Error(403, "You must be logged in to Down Vote");
    var wish = Wishes.findOneWrapped(wishId);
    if (! wish)
      throw new Meteor.Error(404, "No such wish");
    if (wish.list().belongsTo(this.userId)) {
      // add new vote
      Wishes.update(wishId,
                     {$set: {done: value}});
    }
  },
  createComment: function(text, wishId){
      Wishes.update(wishId,
                     {$push: {comments: {comment:text, user:Meteor.userId()}}});
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
