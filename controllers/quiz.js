const Sequelize = require("sequelize");
const Op = Sequelize.Op;
const {models} = require("../models");
const cloudinary = require('cloudinary');
const fs = require('fs');
const attHelper = require("../helpers/attachments");

const moment = require('moment');

const multer  = require('multer');

const paginate = require('../helpers/paginate').paginate;

// Options for the files uploaded to Cloudinary
const cloudinary_upload_options = {
    async: false,
    folder: "/core/quiz2018/attachments",
    resource_type: "auto",
    tags: ['core', 'iweb', 'cdps', 'quiz']
};


//const Op = Sequelize.Op;

//const Op = Sequelize.Op;

// Autoload el quiz asociado a :quizId
exports.load = (req, res, next, quizId) => {

    const options = {
        include: [
            models.tip,
            models.attachment,
            {model: models.user, as: 'author'}
        ]
    };

    // For logged in users: include the favourites of the question by filtering by
    // the logged in user with an OUTER JOIN.
    if (req.session.user) {
        options.include.push({
            model: models.user,
            as: "fans",
            where: {id: req.session.user.id},
            required: false  // OUTER JOIN
        });
    }

    models.quiz.findByPk(quizId, options)
    .then(quiz => {
        if (quiz) {
            req.quiz = quiz;
            next();
        } else {
            throw new Error('There is no quiz with id=' + quizId);
        }
    })
    .catch(error => next(error));
};


// MW - Un usuario no puede crear mas de 50 quizzes al dia.
exports.limitPerDay = (req, res, next) => {

    const LIMIT_PER_DAY = 50;

    const yesterday = moment().subtract(1, 'days')

    // console.log("ayer = ", yesterday.calendar());

    let countOptions = {
        where: {
            authorId: req.session.user.id,
            createdAt: {$gte: yesterday}
        }
    };

    models.quiz.count(countOptions)
    .then(count => {
        if (count < LIMIT_PER_DAY) {
            next();
        } else {
            req.flash('error', `Maximun ${LIMIT_PER_DAY} new quizzes per day.`);
            res.redirect('/goback');
        }
    });
};


// MW that allows actions only if the user logged in is admin or is the author of the quiz.
exports.adminOrAuthorRequired = (req, res, next) => {

    const isAdmin  = !!req.session.user.isAdmin;
    const isAuthor = req.quiz.authorId === req.session.user.id;

    if (isAdmin || isAuthor) {
        next();
    } else {
        console.log('Prohibited operation: The logged in user is not the author of the quiz, nor an administrator.');
        res.send(403);
    }
};


// GET /quizzes
exports.index = (req, res, next) => {

    let countOptions = {
        where: {},
        include: []
    };

    const searchfavourites = req.query.searchfavourites || "";

    let title = "Questions";

    // Search:
    const search = req.query.search || '';
    if (search) {
        const search_like = "%" + search.replace(/ +/g,"%") + "%";

        countOptions.where = {question: { [Op.like]: search_like }};
    }

    // If there exists "req.user", then only the quizzes of that user are shown
    if (req.user) {
        countOptions.where.authorId = req.user.id;

        if (req.session.user && req.session.user.id == req.user.id) {
            title = "My Questions";
        } else {
            title = "Questions of " + req.user.username;
        }
    }

    // Filter: my favourite quizzes:
    if (req.session.user) {
        if (searchfavourites) {
            countOptions.include.push({
                model: models.user,
                as: "fans",
                where: {id: req.session.user.id},
                attributes: ['id']

            });
        } else {

            // NOTE:
            // It should be added the options ( or similars )
            // to have a lighter query:
            //    where: {id: req.session.user.id},
            //    required: false  // OUTER JOIN
            // but this does not work with SQLite. The generated
            // query fails when there are several fans of the same quiz.

            countOptions.include.push({
                model: models.user,
                as: "fans",
                attributes: ['id']
            });
        }
    }

    models.quiz.count(countOptions)
    .then(count => {

        // Pagination:

        const items_per_page = 10;

        // The page to show is given in the query
        const pageno = parseInt(req.query.pageno) || 1;

        // Create a String with the HTMl used to render the pagination buttons.
        // This String is added to a local variable of res, which is used into the application layout file.
        res.locals.paginate_control = paginate(count, items_per_page, pageno, req.url);

        const findOptions = {
            ...countOptions,
            offset: items_per_page * (pageno - 1),
            limit: items_per_page
        };

        findOptions.include.push(models.attachment);
        findOptions.include.push({
            model: models.user,
            as: 'author'
        });

        return models.quiz.findAll(findOptions);
    })
    .then(quizzes => {

        const format = (req.params.format || 'html').toLowerCase();

        switch (format) {
            case 'html':

                // Mark favourite quizzes:
                if (req.session.user) {
                    quizzes.forEach(quiz => {
                        quiz.favourite = quiz.fans.some(fan => {
                            return fan.id == req.session.user.id;
                        });
                    });
                }

                res.render('quizzes/index.ejs', {
                    quizzes,
                    search,
                    searchfavourites,
                    title,
                    attHelper
                });
                break;

            case 'json':
                res.json(quizzes);
                break;

            default:
                console.log('No supported format \".' + format + '\".');
                res.sendStatus(406);
        }
    })
    .catch(error => next(error));
};


// GET /quizzes/:quizId
exports.show = (req, res, next) => {

    const {quiz} = req;

    const format = (req.params.format || 'html').toLowerCase();

    switch (format) {
        case 'html':

            new Promise((resolve, reject) => {

                // Only for logger users:
                //   if this quiz is one of my fovourites, then I create
                //   the attribute "favourite = true"
                if (req.session.user) {
                    resolve(
                        req.quiz.getFans({where: {id: req.session.user.id}})
                        .then(fans => {
                            if (fans.length > 0) {
                                req.quiz.favourite = true;
                            }
                        })
                    );
                } else {
                    resolve();
                }
            })
            .then(() => {
                res.render('quizzes/show', {
                    quiz,
                    attHelper
                });
            })
            .catch(error => next(error));
            break;

        case 'json':
            res.json(quiz);
            break;

        default:
            console.log('No supported format \".' + format + '\".');
            res.sendStatus(406);
    }
};


// GET /quizzes/new
exports.new = (req, res, next) => {

    const quiz = {
        question: "",
        answer: ""
    };

    res.render('quizzes/new', {quiz});
};

// POST /quizzes/create
exports.create = (req, res, next) => {

    const upload = multer({dest: './uploads/', limits: {fileSize: 2 * 1024 * 1024}}).single('image');

    new Sequelize.Promise((resolve, reject) => {

        // loads fields from multipart form.
        upload(req, res, error => {

            if (error instanceof multer.MulterError) {
                // A Multer error occurred when uploading.
                req.flash('error', 'Failure uploading attachment file to the server: ' + error.message);
                reject(error);
            } else if (error) {
                // An unknown error occurred when uploading.
                reject(error);
            } else {
                // Everything went fine.
                resolve();
            }
        })
    })
    .then(() => {

        const {question, answer} = req.body;

        const authorId = req.session.user && req.session.user.id || 0;

        const quiz = models.quiz.build({
            question,
            answer,
            authorId
        });

        // Saves only the fields question and answer into the DDBB
        return quiz.save({fields: ["question", "answer", "authorId"]});
    })
    .then(quiz => {
        req.flash('success', 'Quiz created successfully.');

        if (!req.file) {
            req.flash('info', 'Quiz without attachment.');
            res.redirect('/quizzes/' + quiz.id);
            return;
        }

        // Save the attachment into  Cloudinary or local file system:

        if (!process.env.CLOUDINARY_URL) {
            req.flash('info', 'Attrachment files are saved into the local file system.');
        } else {
            req.flash('info', 'Attrachment files are saved at Cloudinary.');
        }

        return attHelper.uploadResource(req.file.path, cloudinary_upload_options)
        .then(uploadResult => {

            // Create the new attachment into the data base.
            return models.attachment.create({
                public_id: uploadResult.public_id,
                url: uploadResult.url,
                filename: req.file.originalname,
                mime: req.file.mimetype,
                quizId: quiz.id })
            .then(attachment => {
                req.flash('success', 'Image saved successfully.');
            })
            .catch(error => { // Ignoring validation errors
                req.flash('error', 'Failed to save file: ' + error.message);
                attHelper.deleteResource(uploadResult.public_id);
            });

        })
        .catch(error => {
            req.flash('error', 'Failed to save attachment: ' + error.message);
        })
        .then(() => {
            fs.unlink(req.file.path, err => {
                if (err) {
                    console.log(`Error deleting file: ${req.file.path} >> ${err}`);
                }
            }); // delete the file uploaded at./uploads
            res.redirect('/quizzes/' + quiz.id);
        });
    })
    .catch(Sequelize.ValidationError, error => {
        req.flash('error', 'There are errors in the form:');
        error.errors.forEach(({message}) => req.flash('error', message));
        res.render('quizzes/new', {quiz});
    })
    .catch(error => {
        req.flash('error', 'Error creating a new Quiz: ' + error.message);
        next(error);
    });
};


// GET /quizzes/:quizId/edit
exports.edit = (req, res, next) => {

    const {quiz} = req;

    res.render('quizzes/edit', {quiz});
};


// PUT /quizzes/:quizId
exports.update = (req, res, next) => {

    const upload = multer({dest: './uploads/', limits: {fileSize: 2 * 1024 * 1024}}).single('image');

    new Sequelize.Promise((resolve, reject) => {

        // loads fields from multipart form.
        upload(req, res, error => {

            if (error instanceof multer.MulterError) {
                // A Multer error occurred when uploading.
                req.flash('error', 'Failure uploading attachment file to the server: ' + error.message);
                reject(error);
            } else if (error) {
                // An unknown error occurred when uploading.
                reject(error);
            } else {
                // Everything went fine.
                resolve();
            }
        })
    })
    .then(() => {

        const {quiz, body} = req;

        quiz.question = body.question;
        quiz.answer = body.answer;

        return quiz.save({fields: ["question", "answer"]});
    })
    .then(quiz => {
        req.flash('success', 'Quiz edited successfully.');

        if (req.body.keepAttachment) {

            if (req.file) {
                fs.unlink(req.file.path, err => {
                    if (err) {
                        console.log(`Error deleting ${req.file.path} file: ${err}`);
                    }
                }); // delete the file uploaded at./uploads
            }

        } else {

            // Solo dejo cambiar el attachment si ha pasado mas de 1 minuto desde el ultimo cambio:
            if (quiz.attachment) {

                const now = moment();
                const lastEdition = moment(quiz.attachment.updatedAt);

                if (lastEdition.add(1,"m").isAfter(now)) {
                    req.flash('error', 'Attached file can not be modified until 1 minute has passed.');
                    return
                }
            }

            // There is no attachment: Delete old attachment.
            if (!req.file) {
                req.flash('info', 'This quiz has no attachment.');
                if (quiz.attachment) {
                    attHelper.deleteResource(quiz.attachment.public_id);
                    quiz.attachment.destroy();
                }
                return;
            }

            // Save the new attachment into Cloudinary or local file system:

            if (!process.env.CLOUDINARY_URL) {
                req.flash('info', 'Attrachment files are saved into the local file system.');
            } else {
                req.flash('info', 'Attrachment files are saved at Cloudinary.');
            }

            return attHelper.uploadResource(req.file.path, cloudinary_upload_options)
            .then(function (uploadResult) {

                // Remenber the public_id of the old image.
                const old_public_id = quiz.attachment ? quiz.attachment.public_id : null;

                // Update the attachment into the data base.
                return quiz.getAttachment()
                .then(function(attachment) {
                    if (!attachment) {
                        attachment = models.attachment.build({ quizId: quiz.id });
                    }
                    attachment.public_id = uploadResult.public_id;
                    attachment.url = uploadResult.url;
                    attachment.filename = req.file.originalname;
                    attachment.mime = req.file.mimetype;
                    return attachment.save();
                })
                .then(function(attachment) {
                    req.flash('success', 'Image saved successfully.');
                    if (old_public_id) {
                        attHelper.deleteResource(old_public_id);
                    }
                })
                .catch(function(error) { // Ignoring image validation errors
                    req.flash('error', 'Failed saving new image: '+error.message);
                    attHelper.deleteResource(uploadResult.public_id);
                });


            })
            .catch(function(error) {
                req.flash('error', 'Failed saving the new attachment: ' + error.message);
            })
            .then(function () {
                fs.unlink(req.file.path, err => {
                    if (err) {
                        console.log(`Error deleting file: ${req.file.path} >> ${err}`);
                    }
                }); // delete the file uploaded at./uploads
            });
        }
    })
    .then(function () {
        res.redirect('/quizzes/' + req.quiz.id);
    })
    .catch(Sequelize.ValidationError, error => {
        req.flash('error', 'There are errors in the form:');
        error.errors.forEach(({message}) => req.flash('error', message));
        res.render('quizzes/edit', {quiz});
    })
    .catch(error => {
        req.flash('error', 'Error editing the Quiz: ' + error.message);
        next(error);
    });
};


// DELETE /quizzes/:quizId
exports.destroy = (req, res, next) => {

    // Delete the attachment at Cloudinary (result is ignored)
    if (req.quiz.attachment) {

        if (!process.env.CLOUDINARY_URL) {
            req.flash('info', 'Attrachment files are saved into the local file system.');
        } else {
            req.flash('info', 'Attrachment files are saved at Cloudinary.');
        }

        attHelper.deleteResource(req.quiz.attachment.public_id);
    }

    req.quiz.destroy()
    .then(() => {
        req.flash('success', 'Quiz deleted successfully.');
        res.redirect('/goback');
    })
    .catch(error => {
        req.flash('error', 'Error deleting the Quiz: ' + error.message);
        next(error);
    });
};


// GET /quizzes/:quizId/play
exports.play = (req, res, next) => {

    const {quiz, query} = req;

    const answer = query.answer || '';

    new Promise(function (resolve, reject) {

        // Only for logger users:
        //   if this quiz is one of my fovourites, then I create
        //   the attribute "favourite = true"
        if (req.session.user) {
            resolve(
                req.quiz.getFans({where: {id: req.session.user.id}})
                .then(fans => {
                    if (fans.length > 0) {
                        req.quiz.favourite = true
                    }
                })
            );
        } else {
            resolve();
        }
    })
    .then(() => {
        res.render('quizzes/play', {
            quiz,
            answer,
            attHelper
        });
    })
    .catch(error => next(error));
};


// GET /quizzes/:quizId/check
exports.check = (req, res, next) => {

    const {quiz, query} = req;

    const answer = query.answer || "";
    const result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();

    res.render('quizzes/result', {
        quiz,
        result,
        answer
    });
};




//GET /quizzes/randomplay
exports.randomPlay = (req,res,next) => {
    
    const scoreNormal = req.session.scoreNormal || 0;
    
    if(scoreNormal === 0){
        req.session.randomPlay = [];
    }
    
    models.quiz.findOne({
        where: {id: {[Sequelize.Op.notIn]: req.session.randomPlay}},
        order: [Sequelize.fn( 'RANDOM' ),]
    })
    .then(quiz => {
        if(!quiz){
            req.session.scoreNormal = 0;
            return res.render('quizzes/random_none.ejs', {scoreNormal});
        }
        else{
            req.session.scoreNormal = scoreNormal;
            return res.render('quizzes/random_play.ejs', {quiz,scoreNormal} );
        }
    })
    .catch(error => {
        next(error);
    }); 
};

//GET /quizzes/randomcheck/:quizId
exports.randomCheck = (req, res, next) => {
    
    const user = req.session.user;


    const {quiz, query} = req;
    let scoreNormal = req.session.scoreNormal;
    let scoreNormal_after;
    let answer = query.answer || "";

     let result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();
     if (result){
            req.session.randomPlay.push(quiz.id);
            scoreNormal_after = ++scoreNormal;
            
     } else {
        scoreNormal_after = 0; 
     } 
     req.session.scoreNormal = scoreNormal_after;
     res.render('quizzes/random_result', {
            result,
            scoreNormal,
            answer
     });   
};

//Aletoriza un array
function fisherYates(array){
    var i=array.length;
    while(i--){
        var j=Math.floor( Math.random() * (i+1) );
        var tmp=array[i]; 
        array[i]=array[j];
        array[j]=tmp;
    }
}

//GET /quizzes/randomplaymultiple
exports.randomPlayMultiple = (req,res,next) => {
    
    const scoreMultiple = req.session.scoreMultiple || 0;
    const posibleAnswers = [];

    var i = 1;
    
    if(scoreMultiple === 0){
        req.session.randomPlayMultiple = [];
    }

    models.quiz.findOne({
        where: {id: {[Sequelize.Op.notIn]: req.session.randomPlayMultiple}},
        order: [Sequelize.fn( 'RANDOM' ),]
    })
    .then(quiz => {
        if(!quiz){
            req.session.scoreMultiple = 0;
            return res.render('quizzes/random_none_multiple.ejs', {scoreMultiple});
        }
        else{
            posibleAnswers[0] = quiz.answer;
            return models.quiz.findAll({
                order: [Sequelize.fn ('RANDOM')],
                where: {answer : {[Sequelize.Op.notIn]: posibleAnswers}},
                limit: 3,
            })
            .then(quizzes => {
                quizzes.forEach(quiz => {
                    posibleAnswers[i] = quiz.answer;
                    i = i + 1; 
                }) 
                req.session.scoreMultiple = scoreMultiple;
                fisherYates(posibleAnswers);
                return res.render('quizzes/random_play_multiple.ejs', {quiz,scoreMultiple, posibleAnswers} );
            })
        }
    })
    .catch(error => {
        next(error);
    });  
};

//GET /quizzes/randomcheckmultiple/:quizId
exports.randomCheckMultiple = (req, res, next) => {
    
    const {user} = req.session;

    const {quiz, query} = req;
    let scoreMultiple = req.session.scoreMultiple;
    let scoreMultiple_after = 0;
    let answer = query.option || "";

    let result = answer.toLowerCase().trim() === quiz.answer.toLowerCase().trim();
    if (result){
        req.session.randomPlayMultiple.push(quiz.id);
        scoreMultiple_after = ++scoreMultiple;
        
    }
    else{
        scoreMultiple_after = 0;
    }
    req.session.scoreMultiple = scoreMultiple_after;
    res.render('quizzes/random_result_multiple', {
            result,
            scoreMultiple,
            answer
    });

    
};


