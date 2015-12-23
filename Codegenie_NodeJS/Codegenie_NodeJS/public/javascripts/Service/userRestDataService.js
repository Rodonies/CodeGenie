﻿(function () {
    
    var userRestData = function ($resource) {
        return {
            
            //userPanel services
            getUser: $resource("/users/mine"),
            getExercises: $resource("/users/exercises"),
            getAnswer: $resource("users/exercises/:exerciseid/answers", { exerciseid: '@exerciseid' }),
            postAnswer: $resource("/users/answer"),
            getStatisticsAnswers: $resource("/statistics/answers")
        };
    };
    
    var module = angular.module("userApp");
    module.factory("userRestData", userRestData);
}());