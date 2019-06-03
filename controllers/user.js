"use strict";

const Sequelize = require("sequelize");
const {models} = require("../models");

const paginate = require('../helpers/paginate').paginate;
const authentication = require('../helpers/authentication');


// Autoload the user with id equals to :userId
exports.load = (req, res, next, userId) => {

    models.user.findByPk(userId)
    .then(user => {
        if (user) {
            req.user = user;
            next();
        } else {
            req.flash('error', 'There is no user with id=' + userId + '.');
            throw new Error('No exist userId=' + userId);
        }
    })
    .catch(error => next(error));
};


// GET /users
exports.index = (req, res, next) => {

    models.user.count()
    .then(count => {

        // Pagination:

        const items_per_page = 10;

        // The page to show is given in the query
        const pageno = parseInt(req.query.pageno) || 1;

        // Create a String with the HTMl used to render the pagination buttons.
        // This String is added to a local variable of res, which is used into the application layout file.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        const findOptions = {
            offset: items_per_page * (pageno - 1),
            limit: items_per_page,
            order: ['username']
        };

        return models.user.findAll(findOptions);
    })
    .then(users => {
        res.render('users/index', {users});
    })
    .catch(error => next(error));
};

// GET /users/ranking

exports.ranking = (req, res, next) => {

    models.user.count()
    .then(count => {

        // Pagination:

        const items_per_page = 10;

        // The page to show is given in the query
        const pageno = parseInt(req.query.pageno) || 1;

        // Create a String with the HTMl used to render the pagination buttons.
        // This String is added to a local variable of res, which is used into the application layout file.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        const findOptions = {
            offset: items_per_page * (pageno - 1),
            limit: items_per_page,
            order: ['score']
        };

        return models.user.findAll(findOptions);
    })
    .then(users => {
        res.render('users/ranking', {users});
    })
    .catch(error => next(error));
};

/*exports.rankinggraph = (req, res, next) => {
    
    let winners = [];
    let scores = [];
    let i = 0;

    models.user.findAll({order:['score']})
    .then( users => {
        users.forEach (user => {
            winners[i] = user.username;
            scores[i] = user.scores;
            })
        res.render('users/renkinggraph', {winners, scores});
    })
    .catch(error => next(error));
};*/


// GET /users/:userId
exports.show = (req, res, next) => {

    const {user} = req;

    res.render('users/show', {user});
};


// GET /users/new
exports.new = (req, res, next) => {

    const user = {
        username: "",
        password: ""
    };

    res.render('users/new', {user});
};


// POST /users
exports.create = (req, res, next) => {

    const {username, password} = req.body;

    const user = models.user.build({
        username,
        password
    });

    // Create the token field:
    user.token = authentication.createToken();


    // Save into the data base
    user.save({fields: ["username", 'token', "password", "salt"]})
    .then(user => { // Render the users page
        req.flash('success', 'User created successfully.' + user.score);
        if (req.session.user) {
            res.redirect('/users/' + user.id);
        } else {
            res.redirect('/session'); // Redirection to the login page
        }
    })
    .catch(Sequelize.UniqueConstraintError, error => {
        req.flash('error', `User "${username}" already exists.`);
        res.render('users/new', {user});
    })
    .catch(Sequelize.ValidationError, error => {
        req.flash('error', 'There are errors in the form:');
        error.errors.forEach(({message}) => req.flash('error', message));
        res.render('users/new', {user});
    })
    .catch(error => next(error));
};


// GET /users/:userId/edit
exports.edit = (req, res, next) => {

    const {user} = req;

    res.render('users/edit', {user});
};


// PUT /users/:userId
exports.update = (req, res, next) => {

    const {user, body} = req;

    // user.username  = body.user.username; // edition not allowed

    let fields_to_update = [];

    // ¿Cambio el password?
    if (req.body.password) {
        console.log('Updating password');
        user.password = body.password;
        fields_to_update.push('salt');
        fields_to_update.push('password');
    }

    user.save({fields: fields_to_update})
    .then(user => {
        req.flash('success', 'User updated successfully.');
        res.redirect('/users/' + user.id);
    })
    .catch(Sequelize.ValidationError, error => {
        req.flash('error', 'There are errors in the form:');
        error.errors.forEach(({message}) => req.flash('error', message));
        res.render('users/edit', {user});
    })
    .catch(error => next(error));
};

//PUT /quizzes/randomupdatescore/:userId
 exports.updatescore = (req, res, next) =>{

    const {user, body} = req;
    
    //user.username = "el guapo";
    //user.token = "new token"
   // user.score = user.score || 0;
    user.scoremultiple = user.scoremultiple || 0;
    user.scorenormal = user.scorenormal || 0;  

    //body.scoreNormal = body.scoreNormal || 0;
    //body.scoreMultiple = body.scoreMultiple || 0;

    /*.scorenormal = body.scoreNormal;
    user.scoremultiple = body.scoreMultiple;
    user.save({fields: ["username", "token", "scorenormal", "scoremultiple", "score"]})
    .then( user =>{
        req.flash('success', 'User score updated successfully. Score.body:' + user.username + ' '+ body.scoreMultiple + ' '+ body.scoreNormal + ' ' + body.score);
        req.flash('success', 'User score updated successfully. Score.user:'+ user.scoremultiple + ' '+ user.scoreNormal + ' ' + user.score);
        res.redirect('/quizzes');
    })*/

    let fields_to_update = [];

    if (req.body.scoreNormal) {
        if (body.scoreNormal > user.scorenormal){
            user.scorenormal = body.scoreNormal;
            fields_to_update.push('scorenormal');
        }
    }

    const result = body.scoreMultiple > user.scoremultiple
    if (req.body.scoreMultiple) {
        if (body.scoreMultiple > user.scoremultiple){
            user.scoremultiple = body.scoreMultiple;
            fields_to_update.push('scoremultiple');
        }
    }
    
    user.score = user.scoremultiple + user.scorenormal;
    fields_to_update.push('score');

    user.save({fields: fields_to_update})

    /*models.quiz.count()
     .then( count => {
        user.score = (user.scorenormal + user.scoremultiple)*count;
        return user.save({fields: ["scorenormal", "scoremultiple", "score"]});
    })*/
    .then( user =>{
        req.flash('success', 'User score updated successfully. Score.body:'+ body.scoreMultiple + ' '+ body.scoreNormal + ' ' + user.username);
        req.flash('success', 'User score updated successfully. Score.user:'+ user.scoremultiple + ' '+ user.scorenormal + ' ' /*+ user.score*/);

        res.redirect('/users/'+ user.id);

    })
    .catch(Sequelize.ValidationError, error => {
        req.flash('error', 'There are errors in the form:');
        error.errors.forEach(({message}) => req.flash('error', message));
        res.render('users/edit', {user});
    })
    .catch(error => {
        next(error);
    });
    

}



// DELETE /users/:userId
exports.destroy = (req, res, next) => {

    req.user.destroy()
    .then(() => {

        // Deleting logged user.
        if (req.session.user && req.session.user.id === req.user.id) {
            // Close the user session
            delete req.session.user;
        }

        req.flash('success', 'User deleted successfully.');
        res.redirect('/goback');
    })
    .catch(error => next(error));
};


//-----------------------------------------------------------


// PUT /users/:id/token
// Create a saves a new user access token.
exports.createToken = function (req, res, next) {

    req.user.token = authentication.createToken();

    req.user.save({fields: ["token"]})
    .then(function (user) {
        req.flash('success', 'User Access Token created successfully.');
        res.redirect('/users/' + user.id);
    })
    .catch(error => next(error));
};

//-----------------------------------------------------------
