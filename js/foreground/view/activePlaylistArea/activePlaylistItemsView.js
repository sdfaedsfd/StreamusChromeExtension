﻿//  TODO: Is this the activePlaylistView now?
//  Represents the videos in a given playlist
define([
    'genericScrollableView',
    'contextMenuGroups',
    'streamItems',
    'playlistItemView',
    'text!../template/activePlaylistItems.htm',
    'utility'
], function (GenericScrollableView, ContextMenuGroups, StreamItems, PlaylistItemView, ActivePlaylistItemsTemplate, Utility) {
    'use strict';

    var ActivePlaylistItemsView = GenericScrollableView.extend({
        
        className: 'left-list',

        template: _.template(ActivePlaylistItemsTemplate),
        
        events: {
            'contextmenu': 'showContextMenu',
            'click .listItem': 'addItemToStream'
        },
        
        attributes: {
            'id': 'activePlaylistItems'
        },
            
        render: function () {
            this.$el.html(this.template(
                _.extend(this.model.toJSON(), {
                    //  Mix in chrome to reference internationalize.
                    'chrome.i18n': chrome.i18n
                })
            ));

            //  Group playlistItems into chunks of 200 to render incrementally to prevent long-running operations.
            var chunkSize = 200;
            var playlistItemChunks = _.toArray(this.model.get('items').groupBy(function (playlistItem, index) {
                return Math.floor(index / chunkSize);
            }));

            var self = this;
            this.incrementalRender(playlistItemChunks, function () {

                self.$el.find('img.lazy').lazyload({
                    container: self.$el,
                    event: 'scroll manualShow'
                });
            });
            
            this.$el.find('.scroll').droppable({
                tolerance: 'pointer',
                over: function (event) {
                    self.doAutoScroll(event);
                },
                drop: function () {
                    self.stopAutoScroll();
                },
                out: function () {
                    self.stopAutoScroll();
                }
            });
            
            return this;
        },
        
        initialize: function() {

            var self = this;
            
            //  Allows for drag-and-drop of videos
            this.$el.sortable({

                //  Adding this helps prevent unwanted clicks to play
                delay: 100,
                cancel: '.big-text',
                connectWith: '#streamItemList',
                appendTo: 'body',
                containment: 'body',
                placeholder: "sortable-placeholder listItem",
                scroll: false,
                cursorAt: {
                    right: 35,
                    bottom: 40
                },
                tolerance: 'pointer',
                helper: function (ui, playlistItem) {
                    
                    this.copyHelper = playlistItem.clone().insertAfter(playlistItem);
                    this.copyHelper.css({ opacity: .5 }).addClass('copyHelper');

                    $(this).data('copied', false);

                    return $('<span>', {
                        'class': 'videoSearchResultsLength',
                        'text': 1
                    });
                },
                start: function () {
                    $('body').addClass('dragging');
                },
                stop: function () {
                    $('body').removeClass('dragging');
                    var copied = $(this).data('copied');

                    if (copied) {
                        this.copyHelper.css({ opacity: 1 }).removeClass('copyHelper');
                    }
                    else{
                        this.copyHelper.remove();
                    }

                    this.copyHelper = null;
                },
                receive: function (event, ui) {

                    var streamItemId = $(ui.item).data('streamitemid');
                    var draggedStreamItem = StreamItems.get(streamItemId);
                    
                    //  It's important to do this to make sure I don't count my helper elements in index.
                    var index = parseInt(ui.item.parent().children('.listItem').index(ui.item));

                    self.model.addByVideoAtIndex(draggedStreamItem.get('video'), index, function() {
                        $(ui.item).remove();
                    });

                    ui.sender.data('copied', true);
                },
                //  Whenever a video row is moved inform the Player of the new video list order
                update: function (event, ui) {
                    
                    var playlistItemId = ui.item.data('playlistitemid');

                    //  Don't run this code when handling stream items -- only when reorganizing playlist items.
                    if (this === ui.item.parent()[0] && playlistItemId) {
                        //  It's important to do this to make sure I don't count my helper elements in index.
                        var index = parseInt(ui.item.parent().children('.listItem').index(ui.item));

                        var sequence = self.model.getSequenceFromIndex(index);

                        var item = self.model.get('items').get(playlistItemId);
                    
                        item.set('sequence', sequence);
                        item.save();
                        self.model.get('items').sort();
                    }
                }
            });
            
            this.listenTo(this.model.get('items'), 'add', this.addItem);
            
            this.listenTo(this.model.get('items'), 'empty', this.render);
            this.listenTo(this.model.get('items'), 'remove', function () {
                //  Trigger a manual show because an item could slide into view and need to load it.
                this.$el.trigger('manualShow');
            });

            Utility.scrollChildElements(this.el, 'span.item-title');
        },
        
        incrementalRender: function (playlistItemChunks, onRenderComplete) {
            //  Render a chunk:
            if (playlistItemChunks.length > 0) {
                var playlistItemChunk = playlistItemChunks.shift();

                //  Build up the views for each playlistItem.
                var items = _.map(playlistItemChunk, function(playlistItem) {
                    var playlistItemView = new PlaylistItemView({
                        model: playlistItem
                    });

                    return playlistItemView.render().el;
                });

                //  Do this all in one DOM insertion to prevent lag in large playlists.
                this.$el.append(items);

                setTimeout(function() {
                    this.incrementalRender(playlistItemChunks, onRenderComplete);
                }.bind(this));

            } else {
                onRenderComplete();
            }

        },

        addItem: function (playlistItem) {

            var playlistItems = this.model.get('items');

            var playlistItemView = new PlaylistItemView({
                model: playlistItem,
                index: playlistItems.indexOf(playlistItem)
            });

            var element = playlistItemView.render().$el;

            if (this.$el.find('.listItem').length > 0) {


                var currentItemIndex = playlistItems.indexOf(playlistItem);

                var previousItem = playlistItems.at(currentItemIndex - 1);
                
                if (previousItem) {
                    var previousItemId = previousItem.get('id');
                    
                    console.log("PlaylistItem's index:", currentItemIndex);
                    var previousItemElement = this.$el.find('.listItem[data-playlistitemid="' + previousItemId + '"]');
                    element.insertAfter(previousItemElement);
                } else {
                    element.insertBefore(this.$el.find('.listItem')[0]);
                }
                

            } else {

                //  TODO: Not very good practice to remove it like this.
                $('.big-text').remove();
    
                element.appendTo(this.$el);
            }

            var self = this;
            element.find('img.lazy').lazyload({
                effect: 'fadeIn',
                container: self.$el,
                event: 'scroll manualShow'
            });
                
            this.scrollItemIntoView(playlistItem);
        },
        
        showContextMenu: function (event) {

            //  Whenever a context menu is shown -- set preventDefault to true to let foreground know to not reset the context menu.
            event.preventDefault();

            if (event.target === event.currentTarget) {
                //  Didn't bubble up from a child -- clear groups.
                ContextMenuGroups.reset();
            }

            var self = this;

            var isAddPlaylistDisabled = this.model.get('items').length === 0;
            var isPlayPlaylistDisabled = this.model.get('items').length === 0;

            ContextMenuGroups.add({

                items: [{
                    text: chrome.i18n.getMessage("addPlaylistToStream"),
                    disabled: isAddPlaylistDisabled,
                    title: isAddPlaylistDisabled ? chrome.i18n.getMessage("noAddStreamWarning") : '',
                    onClick: function () {

                        if (!isAddPlaylistDisabled) {
                            StreamItems.addByPlaylist(self.model, false);
                        }

                    }
                }, {
                    text: chrome.i18n.getMessage("playPlaylistInStream"),
                    disabled: isPlayPlaylistDisabled,
                    title: isPlayPlaylistDisabled ? chrome.i18n.getMessage("noAddStreamWarning") : '',
                    onClick: function () {

                        if (!isPlayPlaylistDisabled) {
                            StreamItems.addByPlaylist(self.model, true);
                        }

                    }
                }]
            });

        },
        
        addItemToStream: function (event) {
            
            //  Add item to stream on dblclick.
            var playlistItemId = $(event.currentTarget).data('playlistitemid');
            var playlistItem = this.model.getPlaylistItemById(playlistItemId);

            StreamItems.addByPlaylistItem(playlistItem);
        },
        
        scrollItemIntoView: function(item) {
            var itemId = item.get('id');
            var activeItem = this.$el.find('.listItem[data-playlistitemid="' + itemId + '"]');

            if (activeItem.length > 0) {
                activeItem.scrollIntoView(true);
            }
        }

    });

    return ActivePlaylistItemsView;
});