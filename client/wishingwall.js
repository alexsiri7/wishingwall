// Client-side JavaScript, bundled and sent to client.

// ID of currently selected list
Session.set('list_id', null);

// Name of currently selected tag for filtering
Session.set('tag_filter', null);

// When adding tag to a wish, ID of the wish
Session.set('editing_addtag', null);

// When editing a list name, ID of the list
Session.set('editing_listname', null);

// When editing wish text, ID of the wish
Session.set('editing_itemname', null);

// Subscribe to 'lists' collection on startup.
// Select a list once data has arrived.
Meteor.subscribe('lists', function () {
  if (!Session.get('list_id')) {
    var list = Lists.findOne({}, {sort: {name: 1}});
    if (list)
      Router.setList(list._id);
  }
});

// Always be subscribed to the wishes for the selected list.
Meteor.autosubscribe(function () {
  var list_id = Session.get('list_id');
  if (list_id)
    Meteor.subscribe('wishes', list_id);
});


////////// Helpers for in-place editing //////////

// Returns an event map that handles the "escape" and "return" keys and
// "blur" events on a text input (given by selector) and interprets them
// as "ok" or "cancel".
var okCancelEvents = function (selector, callbacks) {
  var ok = callbacks.ok || function () {};
  var cancel = callbacks.cancel || function () {};

  var events = {};
  events['keyup '+selector+', keydown '+selector+', focusout '+selector] =
    function (evt) {
      if (evt.type === "keydown" && evt.which === 27) {
        // escape = cancel
        cancel.call(this, evt);

      } else if (evt.type === "keyup" && evt.which === 13 ||
                 evt.type === "focusout") {
        // blur/return/enter = ok/submit if non-empty
        var value = String(evt.target.value || "");
        if (value)
          ok.call(this, value, evt);
        else
          cancel.call(this, evt);
      }
    };
  return events;
};

var activateInput = function (input) {
  input.focus();
  input.select();
};

////////// Lists //////////

Template.lists.lists = function () {
  return Lists.findWrapped({}, {sort: {name: 1}});
};
Template.lists.user_can_create_list = function () {
	return Meteor.user();
}

Template.lists.events({
  'mousedown .list': function (evt) { // select list
    Router.setList(this._id);
  },
  'click .list': function (evt) {
    // prevent clicks on <a> from refreshing the page.
    evt.preventDefault();
  },
  'dblclick .list': function (evt, tmpl) { // start editing list name
    Session.set('editing_listname', this._id);
    Meteor.flush(); // force DOM redraw, so we can focus the edit field
    activateInput(tmpl.find("#list-name-input"));
  }
});

// Attach events to keydown, keyup, and blur on "New list" input box.
Template.lists.events(okCancelEvents(
  '#new-list',
  {
    ok: function (text, evt) {
      Meteor.call("createList", text, function(error, id){	
	if (!error){
          Router.setList(id);
          evt.target.value = "";
        }
      });
    }
  }));

Template.lists.events(okCancelEvents(
  '#list-name-input',
  {
    ok: function (value) {
      Lists.update(this._id, {$set: {name: value}});
      Session.set('editing_listname', null);
    },
    cancel: function () {
      Session.set('editing_listname', null);
    }
  }));

Template.lists.selected = function () {
  return Session.equals('list_id', this._id) ? 'selected' : '';
};

Template.lists.name_class = function () {
  return this.name ? '' : 'empty';
};

Template.lists.editing = function () {
  return Session.equals('editing_listname', this._id);
};

////////// wishes //////////

Template.wishes.any_list_selected = function () {
  return !Session.equals('list_id', null);
};

Template.wishes.remaining_votes = function () {
        var list = Lists.findOneWrapped({_id:Session.get('list_id')});
	return list.getRemainingVotes(Meteor.userId());
};


Template.wishes.user_can_delete_list = function () {
        var list = Lists.findOneWrapped({_id:Session.get('list_id')});
	return list.belongsTo(Meteor.userId());
}


Template.wishes.events(okCancelEvents(
  '#new-wish',
  {
    ok: function (text, evt) {
      var tag = Session.get('tag_filter');
      Meteor.call("createWish", text, Session.get('list_id'), tag ? [tag] : []);
      evt.target.value = '';
    }
  }));

Template.wishes.events({
  'click .list-destroy': function () {
     Lists.remove({_id:Session.get('list_id')});
     Session.set('list_id', null);
  }
});

Template.wishes.list_sponsor = function () {
  var list_id = Session.get('list_id');
  if (!list_id)
    return "";
  var list = Lists.findOneWrapped({_id:list_id});
  if (list)
    return list.getSponsorName();
}

Template.wishes.list_name = function () {
  // Determine which wishes to display in main pane,
  // selected based on list_id and tag_filter.

  var list_id = Session.get('list_id');
  if (!list_id)
    return "";
  var list = Lists.findOne({_id:list_id});
  if (list)
    return list.name;
}

Template.wishes.user_can_create_wish = function () {
	return Meteor.user();
}

Template.wishes.wishes = function () {
  // Determine which wishes to display in main pane,
  // selected based on list_id and tag_filter.

  var list_id = Session.get('list_id');
  if (!list_id)
    return {};

  var sel = {list_id: list_id};
  var tag_filter = Session.get('tag_filter');
  if (tag_filter)
    sel.tags = tag_filter;

  return Wishes.findWrapped(sel, {sort: {votes: -1}});
};

Template.wish.tag_objs = function () {
  var wish_id = this._id;
  return _.map(this.tags || [], function (tag) {
    return {wish_id: wish_id, tag: tag};
  });
};

Template.wish.done_class = function () {
  return this.done ? 'done' : '';
};

Template.wish.done_checkbox = function () {
  return this.done ? 'checked="checked"' : '';
};

Template.wish.editing = function () {
  return Session.equals('editing_itemname', this._id);
};

Template.wish.votes_count = function () {
	var votes = this.getVotesCount();
	return votes+(votes!==1?' votes':' vote');
}
Template.wish.adding_tag = function () {
  return Session.equals('editing_addtag', this._id);
};

Template.wish.user_can_delete_wish = function () {
	return this.canBeDeleted(Meteor.userId());
}

Template.wish.user_can_complete_wish = function () {
        var list = Lists.findOneWrapped({_id:this.list_id});
	return list.belongsTo(Meteor.userId());
}

Template.wish.user_can_voteup_wish = function () {
	return Meteor.user() && this.list().hasRemainingVotes(Meteor.userId());
}


Template.wish.user_can_votedown_wish = function () {
	return Meteor.user() && this.hasAsVoter(Meteor.userId());
}

Template.wish.events({
  'click .check': function () {
    Wishes.update(this._id, {$set: {done: !this.done}});
  },

  'click .destroy': function () {
    Wishes.remove(this._id);
  },
  'click .voteup': function () {
    Meteor.call("voteup", this._id);
  },
  'click .votedown': function () {
    Meteor.call("votedown", this._id);
  },
  'click .addtag': function (evt, tmpl) {
    Session.set('editing_addtag', this._id);
    Meteor.flush(); // update DOM before focus
    activateInput(tmpl.find("#edittag-input"));
  },
  'dblclick .display .wish-text': function (evt, tmpl) {
    Session.set('editing_itemname', this._id);
    Meteor.flush(); // update DOM before focus
    activateInput(tmpl.find("#wish-input"));
  },

  'click .remove': function (evt) {
    var tag = this.tag;
    var id = this.wish_id;

    evt.target.parentNode.style.opacity = 0;
    // wait for CSS animation to finish
    Meteor.setTimeout(function () {
      Wishes.update({_id: id}, {$pull: {tags: tag}});
    }, 300);
  }
});

Template.wish.events(okCancelEvents(
  '#wish-input',
  {
    ok: function (value) {
      Wishes.update(this._id, {$set: {text: value}});
      Session.set('editing_itemname', null);
    },
    cancel: function () {
      Session.set('editing_itemname', null);
    }
  }));

Template.wish.events(okCancelEvents(
  '#edittag-input',
  {
    ok: function (value) {
      Wishes.update(this._id, {$addToSet: {tags: value}});
      Session.set('editing_addtag', null);
    },
    cancel: function () {
      Session.set('editing_addtag', null);
    }
  }));

////////// Tag Filter //////////

// Pick out the unique tags from all wishes in current list.
Template.tag_filter.tags = function () {
  var tag_infos = [];
  var total_count = 0;

  Wishes.find({list_id: Session.get('list_id')}).forEach(function (wish) {
    _.each(wish.tags, function (tag) {
      var tag_info = _.find(tag_infos, function (x) { return x.tag === tag; });
      if (! tag_info)
        tag_infos.push({tag: tag, count: 1});
      else
        tag_info.count++;
    });
    total_count++;
  });

  tag_infos = _.sortBy(tag_infos, function (x) { return x.tag; });
  tag_infos.unshift({tag: null, count: total_count});

  return tag_infos;
};

Template.tag_filter.tag_text = function () {
  return this.tag || "All items";
};

Template.tag_filter.selected = function () {
  return Session.equals('tag_filter', this.tag) ? 'selected' : '';
};

Template.tag_filter.events({
  'mousedown .tag': function () {
    if (Session.equals('tag_filter', this.tag))
      Session.set('tag_filter', null);
    else
      Session.set('tag_filter', this.tag);
  }
});

////////// Tracking selected list in URL //////////

var wishesRouter = Backbone.Router.extend({
  routes: {
    ":list_id": "main"
  },
  main: function (list_id) {
    Session.set("list_id", list_id);
    Session.set("tag_filter", null);
  },
  setList: function (list_id) {
    this.navigate(list_id, true);
  }
});

Router = new wishesRouter;

Meteor.startup(function () {
  Backbone.history.start({pushState: true});
});
