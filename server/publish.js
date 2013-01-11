// Lists -- {name: String}
Lists = new Meteor.Collection("lists");

// Publish complete set of lists to all clients.
Meteor.publish('lists', function () {
  return Lists.find();
});


// Wishes -- {text: String,
//           done: Boolean,
//           tags: [String, ...],
//           list_id: String,
//           timestamp: Number}
Wishes = new Meteor.Collection("wishes");

// Publish all items for requested list_id.
Meteor.publish('wishes', function (list_id) {
  return Wishes.find({list_id: list_id});
});

