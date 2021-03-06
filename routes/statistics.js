﻿var schemas = require('../mongoose/schemas');
var express = require('express');
var mongoose = require('mongoose');
var auth = require('../passport/authlevels');
var router = express.Router();
var moment = require('moment');

//TODO (maybe): split this like admin & users

var UserModel = schemas.UserModel;
var ExerciseModel = schemas.ExerciseModel;
var AnswerModel = schemas.AnswerModel;

var isLoggedIn = auth.isLoggedIn;
var isAdmin = auth.isAdmin;

router.get('/', isLoggedIn, function (req, res) {
    var response = {users: 0, admins: 0, exercises: 0, answers: 0, classes: []};

    ExerciseModel.count(function (err, c) {
        response.exercises = c;

        AnswerModel.count(function (err, c) {
            response.answers = c;

            UserModel.count(function (err, c) {
                response.users = c;

                UserModel.count({admin: true}, function (err, c) {
                    response.admins = c;

                    UserModel.find({}, {class: 1}).lean().exec(function (err, result) {
                        var ar = countclasses(result);
                        for (var index in ar[0]) response.classes.push({class: ar[0][index], count: ar[1][index]});

                        res.status(200).json(response);
                    });
                });
            });
        });
    });
});

router.get('/graph', isLoggedIn, function (req, res) {
    var filter = req.query.filter;

    AnswerModel.aggregate(
        [
            {
                $group: {
                    "_id": {
                        "exerciseid": "$exerciseid",
                        "created": "$created",
                        "year": {$year: "$created"},
                        "week": {$week: "$created"}
                    },
                    "revised": {$push: "$revised"}
                }
            },
            {
                $sort: {"_id.created": -1}
            },
            {$unwind: "$revised"},
            {
                $group: {
                    "_id": {"filter": {$cond: [{$eq: [filter, "year"]}, "$_id.year", "$_id.week"]}},
                    "count": {$sum: 1}
                }
            },
            {
                $project: {
                    "_id": 0,
                    "count": "$count",
                    "filter": "$_id.filter"
                }
            }
        ],
        function (err, aggresult) {
            if (err) return console.error(err);
            AnswerModel.aggregate(
                [
                    {"$match": {"revised": true}},
                    {
                        $group: {
                            "_id": {
                                "exerciseid": "$exerciseid",
                                "week": {$week: "$created"},
                                "created": "$created",
                                "course": "$course"
                            },
                            "answers": {$push: "$answers"}
                        }
                    },
                    {
                        $sort: {"_id.created": 1}
                    },
                    {$unwind: "$answers"},
                    {$unwind: "$answers"},
                    {
                        $group: {
                            "_id": {
                                "questiontitle": "$answers.questiontitle",
                                "exerciseid": "$_id.exerciseid",
                                "week": "$_id.week"
                            },
                            "received": {$avg: "$answers.received"},
                            "weight": {$avg: "$answers.weight"}
                        }
                    },
                    {
                        $group: {
                            "_id": {
                                "exerciseid": "$_id.exerciseid",
                                "week": "$_id.week"
                            },
                            "received": {$sum: "$received"},
                            "weight": {$sum: "$weight"}
                        }
                    },
                    {
                        $group: {
                            "_id": {"week": "$_id.week"},
                            "received": {$avg: "$received"},
                            "weight": {$avg: "$weight"}
                        }
                    },
                    {
                        $group: {
                            "_id": "$_id.week",
                            "received": {$avg: "$received"},
                            "weight": {$avg: "$weight"}
                        }
                    },
                    {
                        $project: {
                            "_id": 0,
                            "week": "$_id",
                            "average": {$multiply: [{$divide: ["$received", "$weight"]}, 100]},
                            "received": "$received",
                            "weight": "$weight"
                        }
                    }
                ],
                function (err, aggresultAverageWeekly) {
                    if (err) return console.error(err);

                    //RESPONSE
                    var response = [];
                    if (aggresult.length != 0) {
                        var first = aggresult[0].filter;
                        var last = aggresult[aggresult.length - 1].filter;

                        do {
                            var found = false;
                            for (var x = 0; x < aggresult.length; x++) {
                                if (aggresult[x].filter == first) {
                                    response.push({"x": first, "y": aggresult[x].count});
                                    found = true;
                                }
                            }
                            if (!found) response.push({"x": first, "y": 0});

                            filter == "year" ? first += 1 : first = (first % 52) + 1;
                        } while (first != (filter == "year" ? last + 1 : (last % 52) + 1));
                    }

                    var responseWeekly = [];
                    if (aggresultAverageWeekly.length != 0) {
                        var first = aggresultAverageWeekly[0].week;
                        var last = aggresultAverageWeekly[aggresultAverageWeekly.length - 1].week;

                        do {
                            var found = false;
                            for (var x = 0; x < aggresultAverageWeekly.length; x++) {
                                if (aggresultAverageWeekly[x].week == first) {
                                    responseWeekly.push({"x": first, "y": aggresultAverageWeekly[x].average});
                                    found = true;
                                }
                            }
                            if (!found) responseWeekly.push({"x": first, "y": 0});

                            first = (first % 52) + 1;
                        } while (first != (last % 52) + 1);
                    }

                    res.status(200).json({"graphWeekly": response, "graphAverageWeekly": responseWeekly});
                });
        });
});

router.get('/course/:course', isLoggedIn, function (req, res) {
    var course = req.params.course;
    var limit = parseInt(req.query.limit ? req.query.limit : 3);

    AnswerModel.aggregate(
        [
            {"$match": {"course": course, "revised": true}},
            {
                $group: {
                    "_id": "$userid",
                    "answers": {$push: "$answers"}
                }
            },
            {$unwind: "$answers"},
            {$unwind: "$answers"},
            {
                $group: {
                    "_id": "$_id",
                    "received": {$sum: "$answers.received"}
                }
            },
            {
                $project: {
                    "_id": 0,
                    "userid": "$_id",
                    "received": "$received"
                }
            },
            {
                $sort: {"received": -1}
            },
            {
                $limit: limit
            }
        ],
        function (err, aggresultTopReceived) {
            if (err) return console.error(err);
            AnswerModel.aggregate(
                [
                    {"$match": {"course": course}},
                    {
                        $group: {
                            "_id": {"userid": "$userid", "exerciseid": "$exerciseid"}
                        }
                    },
                    {
                        $group: {
                            "_id": "$_id.userid",
                            "count": {$sum: 1}
                        }
                    },
                    {
                        $project: {
                            "_id": 0,
                            "userid": "$_id",
                            "count": "$count"
                        }
                    },
                    {
                        $sort: {"count": -1}
                    },
                    {
                        $limit: limit
                    }
                ],
                function (err, aggresultTopAmount) {
                    if (err) return console.error(err);
                    var topReceived = [];
                    var topAmount = [];

                    for (var x = 0; x < aggresultTopReceived.length; x++)
                        topReceived.push({
                            "userid": aggresultTopReceived[x].userid,
                            "index": x
                        })

                    for (var x = 0; x < aggresultTopAmount.length; x++)
                        topAmount.push({
                            "userid": aggresultTopAmount[x].userid,
                            "index": x
                        })

                    var promisesTopReceived = topReceived.map(function (obj) {
                        return new Promise(function (resolve, reject) {
                            UserModel.findOne({_id: obj.userid}, {name: 1}, function (err, usresult) {
                                if (err) return reject(err);
                                if (usresult)  aggresultTopReceived[obj.index].name = usresult.name;
                                resolve();
                            });
                        });
                    });

                    var promisesTopAmount = topAmount.map(function (obj) {
                        return new Promise(function (resolve, reject) {
                            UserModel.findOne({_id: obj.userid}, {name: 1}, function (err, usresult) {
                                if (err) return reject(err);
                                if (usresult)  aggresultTopAmount[obj.index].name = usresult.name;
                                resolve();
                            });
                        });
                    });

                    Promise.all(promisesTopReceived).then(function () {
                        Promise.all(promisesTopAmount).then(function () {
                            res.status(200).json({
                                "topReceived": aggresultTopReceived,
                                "topAmount": aggresultTopAmount
                            });
                        }).catch(console.error);
                    }).catch(console.error);
                });
        });
});

router.get('/users/mine', isLoggedIn, function (req, res) {
    var userID = req.user._id;

    SendUserStatistic(userID, res);
});

router.get('/users/:userID', isAdmin, function (req, res) {
    var userID = req.params.userID;

    UserModel.findById(userID).lean().exec(function (err, result) {
        if (err) return console.error(err);
        if (!result) return res.status(400).json(["Not an eligible user ID."]);

        SendUserStatistic(userID, res);
    });
});

router.get('/exercises', isLoggedIn, function (req, res) {
    var response = {count: 0, courses: []};

    ExerciseModel.count(function (err, c) {
        response.count = c;

        ExerciseModel.find({}, {course: 1}).lean().exec(function (err, result) {
            var ar = countcourses(result);
            for (var index in ar[0]) response.courses.push({course: ar[0][index], count: ar[1][index]});

            res.status(200).json(response);
        });
    });
});

router.get('/exercises/:exerciseID/graph', isLoggedIn, function (req, res) {
    var exerciseID = req.params.exerciseID;
    var filter = req.query.filter;

    ExerciseModel.findById(exerciseID).lean().exec(function (err, result) {
        if (err) return console.error(err);
        if (!result) return res.status(400).json(["Not an eligible exercise ID."]);

        AnswerModel.aggregate(
            [
                {"$match": {"exerciseid": mongoose.Types.ObjectId(exerciseID)}},
                {
                    $group: {
                        "_id": {
                            "exerciseid": "$exerciseid",
                            "created": "$created",
                            "year": {$year: "$created"},
                            "week": {$week: "$created"},
                            "revised": {$cond: [{$eq: ['$revised', true]}, 1, 0]},
                            "unrevised": {$cond: [{$eq: ['$revised', false]}, 1, 0]}
                        },
                        "revised": {$push: "$revised"}
                    }
                },
                {
                    $sort: {"_id.created": -1}
                },
                {$unwind: "$revised"},
                {
                    $group: {
                        "_id": {$cond: [{$eq: [filter, "year"]}, "$_id.year", "$_id.week"]},
                        "count": {$sum: 1},
                        "revised": {$sum: "$_id.revised"},
                        "unrevised": {$sum: "$_id.unrevised"}
                    }
                },
                {
                    $project: {
                        "_id": 0,
                        "count": "$count",
                        "filter": "$_id",
                        "revised": "$revised",
                        "unrevised": "$unrevised"
                    }
                }
            ],
            function (err, aggresult) {
                console.log(aggresult);

                if (err) return console.error(err);
                var responseCount = [];
                var responseRevised = [];
                var responseUnrevised = [];

                if (aggresult.length != 0) {

                    var first = aggresult[0].filter;
                    var last = aggresult[aggresult.length - 1].filter;

                    do {
                        var found = false;
                        for (var x = 0; x < aggresult.length; x++) {
                            if (aggresult[x].filter == first) {
                                responseCount.push({"x": first, "y": aggresult[x].count});
                                responseRevised.push({"x": first, "y": aggresult[x].revised});
                                responseUnrevised.push({"x": first, "y": aggresult[x].unrevised});
                                found = true;
                            }
                        }
                        if (!found) {
                            responseCount.push({"x": first, "y": 0});
                            responseRevised.push({"x": first, "y": 0});
                            responseUnrevised.push({"x": first, "y": 0});
                        }

                        filter == "year" ? first += 1 : first = (first % 52) + 1;
                    } while (first != (filter == "year" ? last + 1 : (last % 52) + 1));
                }

                res.status(200).json({
                    "total": responseCount,
                    "revised": responseRevised,
                    "unrevised": responseUnrevised
                });
            });
    });
});

router.get('/exercises/:exerciseID/average', isLoggedIn, function (req, res) {
    var exerciseID = req.params.exerciseID;
    var limit = parseInt(req.query.limit ? req.query.limit : 3);
    var response = {
        count: 0,
        title: "",
        classification: "",
        course: "",
        extra: false,
        top: [],
        questions: [{
            questiontitle: "",
            weight: 0,
            extra: false,
            type: "",
            average: 0,
            feedback: 0
        }]
    };

    ExerciseModel.findById(exerciseID).lean().exec(function (err, result) {
        if (err) return console.error(err);
        if (!result) return res.status(400).json(["Not an eligible exercise ID."]);

        AnswerModel.find({exerciseid: exerciseID, revised: true}).lean().exec(function (err, result) {
            if (err) return console.error(err);
            if (!result.length) return res.status(400).json([]);
            response.count = result.length;

            response.title = result[0].title;
            response.classification = result[0].classification;
            response.course = result[0].course;
            response.extra = result[0].extra;

            var final = [];
            var questiontemplate = result[0].answers;
            for (var i = 0; i < questiontemplate.length; i++) {
                var obj = questiontemplate[i];
                if (!final.hasOwnProperty(obj)) {
                    var filtered = {questiontitle: "", extra: false, type: "", weight: 0, average: 0, feedback: 0};

                    filtered.questiontitle = obj.questiontitle;
                    filtered.extra = obj.extra;
                    filtered.type = obj.type;
                    filtered.weight = obj.weight;

                    final.push(filtered);
                }
            }

            AnswerModel.aggregate(
                [
                    {"$match": {"exerciseid": mongoose.Types.ObjectId(exerciseID), "revised": true}},
                    {
                        $group: {
                            "_id": "$exerciseid",
                            "answers": {$push: "$answers"}
                        }
                    },
                    {$unwind: "$answers"},
                    {$unwind: "$answers"},
                    {
                        $group: {
                            "_id": "$answers.questiontitle",
                            "received": {$avg: "$answers.received"},
                            "feedback": {$avg: "$answers.feedback"}
                        }
                    },
                    {
                        $group: {
                            "_id": "$_id",
                            "average": {$avg: "$received"},
                            "feedback": {$avg: "$feedback"}
                        }
                    }
                ],
                function (err, aggresult) {
                    if (err) return console.error(err);
                    for (var i = 0; i < aggresult.length; i++) {
                        for (var x = 0; x < final.length; x++) {
                            var aggobj = aggresult[i];
                            if (aggobj._id == final[x].questiontitle) {
                                final[x].average = aggobj.average;
                                final[x].feedback = aggobj.feedback;
                            }
                        }
                    }

                    response.questions = final;

                    AnswerModel.aggregate(
                        [
                            {"$match": {"exerciseid": mongoose.Types.ObjectId(exerciseID), "revised": true}},
                            {
                                $group: {
                                    "_id": "$userid",
                                    "answers": {$push: "$answers"}
                                }
                            },
                            {$unwind: "$answers"},
                            {$unwind: "$answers"},
                            {
                                $group: {
                                    "_id": "$_id",
                                    "received": {$sum: "$answers.received"}
                                }
                            },
                            {
                                $project: {
                                    "_id": 0,
                                    "userid": "$_id",
                                    "received": "$received"
                                }
                            },
                            {
                                $sort: {"received": -1}
                            },
                            {
                                $limit: limit
                            }
                        ],
                        function (err, aggresultTop) {
                            if (err) return console.error(err);
                            var topUsers = [];

                            for (var x = 0; x < aggresultTop.length; x++)
                                topUsers.push({
                                    "userid": aggresultTop[x].userid,
                                    "received": aggresultTop[x].received,
                                    "index": x
                                })

                            var promises = topUsers.map(function (obj) {
                                return new Promise(function (resolve, reject) {
                                    UserModel.findOne({_id: obj.userid}, {name: 1}, function (err, usresult) {
                                        if (err) return reject(err);
                                        if (usresult) aggresultTop[obj.index].name = usresult.name;
                                        resolve();
                                    });
                                });
                            });

                            Promise.all(promises).then(function () {
                                response.top = aggresultTop;

                                res.status(200).json(response);
                            }).catch(console.error);
                        });
                });
        });
    });
});

router.get('/answers', isLoggedIn, function (req, res) {
    var response = {count: 0, courses: []};

    AnswerModel.count(function (err, c) {
        response.count = c;

        AnswerModel.find({userid: req.user._id}).lean().exec(function (err, myAnswers) {
            response.myself = myAnswers.length;

            AnswerModel.find({}, {course: 1}).lean().exec(function (err, result) {
                var ar = countcourses(result);
                for (var index in ar[0]) response.courses.push({course: ar[0][index], count: ar[1][index]});

                res.status(200).json(response);
            });
        });
    });
});

router.get('/answers/revised', isLoggedIn, function (req, res) {
    var response = {count: 0, courses: []};

    AnswerModel.count({revised: true}, function (err, c) {
        response.count = c;

        AnswerModel.find({revised: true}, {course: 1}).lean().exec(function (err, result) {
            var ar = countcourses(result);
            for (var index in ar[0]) response.courses.push({course: ar[0][index], count: ar[1][index]});

            res.status(200).json(response);
        });
    });
});

router.get('/answers/unrevised', isLoggedIn, function (req, res) {
    var response = {count: 0, courses: []};

    AnswerModel.count({revised: false}, function (err, c) {
        response.count = c;

        AnswerModel.find({revised: false}, {course: 1}).lean().exec(function (err, result) {
            var ar = countcourses(result);
            for (var index in ar[0]) response.courses.push({course: ar[0][index], count: ar[1][index]});

            res.status(200).json(response);
        });
    });
});

function SendUserStatistic(userID, res) {
    AnswerModel.aggregate(
        [
            {"$match": {"userid": mongoose.Types.ObjectId(userID)}},
            {
                $group: {
                    "_id": {
                        "exerciseid": "$exerciseid",
                        "exercisetitle": "$title",
                        "created": "$created",
                        "revised": "$revised"
                    },
                    "answers": {$push: "$answers"}
                }
            },
            {$unwind: "$answers"},
            {$unwind: "$answers"},
            {
                $group: {
                    "_id": {
                        "exerciseid": "$_id.exerciseid",
                        "exercisetitle": "$_id.exercisetitle",
                        "created": "$_id.created",
                        "revised": "$_id.revised"
                    },
                    "weight": {$sum: "$answers.weight"},
                    "received": {$sum: "$answers.received"}
                }
            },
            {
                $project: {
                    "_id": 0,
                    "exerciseid": "$_id.exerciseid",
                    "exercisetitle": "$_id.exercisetitle",
                    "created": "$_id.created",
                    "revised": "$_id.revised",
                    "weight": "$weight",
                    "received": "$received"
                }
            }
        ],
        function (err, aggresultReceived) {
            if (err) return console.error(err);
            AnswerModel.aggregate(
                [
                    {"$match": {"userid": mongoose.Types.ObjectId(userID), "revised": true}},
                    {
                        $group: {
                            "_id": {"exerciseid": "$exerciseid", "week": {$week: "$created"}},
                            "answers": {$push: "$answers"}
                        }
                    },
                    {$unwind: "$answers"},
                    {$unwind: "$answers"},
                    {
                        $group: {
                            "_id": {
                                "questiontitle": "$answers.questiontitle",
                                "exerciseid": "$_id.exerciseid",
                                "week": "$_id.week"
                            },
                            "received": {$avg: "$answers.received"},
                            "weight": {$avg: "$answers.weight"}
                        }
                    },
                    {
                        $group: {
                            "_id": {"exerciseid": "$_id.exerciseid", "week": "$_id.week"},
                            "received": {$sum: "$received"},
                            "weight": {$sum: "$weight"}
                        }
                    },
                    {
                        $group: {
                            "_id": "$_id.week",
                            "received": {$avg: "$received"},
                            "weight": {$avg: "$weight"}
                        }
                    },
                    {
                        $sort: {"_id": 1}
                    },
                    {
                        $project: {
                            "_id": 0,
                            "week": "$_id",
                            "average": {$multiply: [{$divide: ["$received", "$weight"]}, 100]},
                            "received": "$received",
                            "weight": "$weight"
                        }
                    }
                ],
                function (err, aggresultAverageWeekly) {
                    if (err) return console.error(err);

                    AnswerModel.aggregate(
                        [
                            {"$match": {"userid": mongoose.Types.ObjectId(userID)}},
                            {
                                $group: {
                                    "_id": {
                                        "exerciseid": "$exerciseid",
                                        "created": "$created",
                                        "week": {$week: "$created"}
                                    }
                                }
                            },
                            {
                                $sort: {"_id.created": -1}
                            },
                            {
                                $group: {
                                    "_id": "$_id.week",
                                    "count": {$sum: 1}
                                }
                            },
                            {
                                $project: {
                                    "_id": 0,
                                    "filter": "$_id",
                                    "count": "$count"
                                }
                            }
                        ],
                        function (err, aggresultActivityWeekly) {
                            if (err) return console.error(err);
                            AnswerModel.aggregate(
                                [
                                    {"$match": {"userid": mongoose.Types.ObjectId(userID)}},
                                    {
                                        $group: {
                                            "_id": {
                                                "exerciseid": "$exerciseid",
                                                "created": "$created",
                                                "hour": {$hour: "$created"}
                                            }
                                        }
                                    },
                                    {
                                        $group: {
                                            "_id": "$_id.hour",
                                            "count": {$sum: 1}
                                        }
                                    },
                                    {
                                        $project: {
                                            "_id": 0,
                                            "filter": "$_id",
                                            "count": "$count"
                                        }
                                    }
                                ],
                                function (err, aggresultActivityHourly) {
                                    if (err) return console.error(err);
                                    UserModel.aggregate(
                                        [
                                            {
                                                $group: {
                                                    "_id": "$_id",
                                                    "logins": {$avg: "$logins"}
                                                }
                                            },
                                            {
                                                $group: {
                                                    "_id": 0,
                                                    "logins": {$avg: "$logins"}
                                                }
                                            },
                                            {
                                                $project: {
                                                    "_id": 0,
                                                    "logins": "$logins"
                                                }
                                            }
                                        ],
                                        function (err, aggresultLogins) {
                                            if (err) return console.error(err);
                                            UserModel.findById(userID, function (err, result) {
                                                if (err) return console.error(err);
                                                var activityWeeklyArray = [];
                                                var activityHourlyArray = [];
                                                if (aggresultActivityWeekly.length != 0) {
                                                    var first = aggresultActivityWeekly[0].filter;
                                                    var last = aggresultActivityWeekly[aggresultActivityWeekly.length - 1].filter;

                                                    do {
                                                        var found = false;
                                                        for (var x = 0; x < aggresultActivityWeekly.length; x++) {
                                                            if (aggresultActivityWeekly[x].filter == first) {
                                                                activityWeeklyArray.push({
                                                                    "x": first,
                                                                    "y": aggresultActivityWeekly[x].count
                                                                });
                                                                found = true;
                                                            }
                                                        }
                                                        if (!found) activityWeeklyArray.push({"x": first, "y": 0});

                                                        first = (first % 52) + 1;
                                                    } while (first != ((last % 52) + 1))
                                                }

                                                if (aggresultActivityHourly.length != 0) {
                                                    for (var i = 0; i < 24; i++) {
                                                        var found = false;
                                                        for (var x = 0; x < aggresultActivityHourly.length; x++) {
                                                            if (aggresultActivityHourly[x].filter == i) {
                                                                activityHourlyArray.push({
                                                                    "x": i,
                                                                    "y": aggresultActivityHourly[x].count
                                                                });
                                                                found = true;
                                                            }
                                                        }
                                                        if (!found) {
                                                            activityHourlyArray.push({
                                                                "x": i,
                                                                "y": 0
                                                            });
                                                        }
                                                    }
                                                }

                                                var averageWeeklyArray = [];
                                                if (aggresultAverageWeekly.length != 0) {
                                                    var first = aggresultAverageWeekly[0].week;
                                                    var last = aggresultAverageWeekly[aggresultAverageWeekly.length - 1].week;

                                                    do {
                                                        var found = false;
                                                        for (var x = 0; x < aggresultAverageWeekly.length; x++) {
                                                            if (aggresultAverageWeekly[x].week == first) {
                                                                averageWeeklyArray.push({"x": first, "y": aggresultAverageWeekly[x].average});
                                                                found = true;
                                                            }
                                                        }
                                                        if (!found) averageWeeklyArray.push({"x": first, "y": 0});

                                                        first = (first % 52) + 1;
                                                    } while (first != (last % 52) + 1);
                                                }

                                                res.status(200).json({
                                                    "received": aggresultReceived,
                                                    "activityWeekly": activityWeeklyArray,
                                                    "activityHourly": activityHourlyArray,
                                                    "averageWeekly": averageWeeklyArray,
                                                    "logins": {
                                                        "average": aggresultLogins[0].logins,
                                                        "mylogins": result.logins
                                                    }
                                                });
                                            });
                                        });
                                });
                        });
                });
        });
}

function countcourses(arr) {
    var a = [], b = [];

    for (var i = 0; i < arr.length; i++) {
        var obj = arr[i].course;
        if (a.indexOf(obj) == -1) {
            a.push(obj);
            b.push(1);
        }
        else b[a.indexOf(obj)] += 1;
    }

    return [a, b];
}

function countclasses(arr) {
    var a = [], b = [];

    for (var i = 0; i < arr.length; i++) {
        var obj = arr[i].class;
        if (a.indexOf(obj) == -1) {
            a.push(obj);
            b.push(1);
        }
        else b[a.indexOf(obj)] += 1;
    }

    return [a, b];
}

module.exports = router;