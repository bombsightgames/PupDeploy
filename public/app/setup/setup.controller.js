angular.module('app').controller('SetupController', function($http, growl) {
    var vm = this;
    vm.step = 0;
    vm.maxSteps = 3;
    vm.setupDone =  false;

    vm.admin = {};

    vm.nextStep = function() {
        vm.step++;
        if (vm.step >= vm.maxSteps) {
            vm.finishSetup();
        }
    };

    vm.previousStep = function() {
        vm.step--;
        if (vm.step < 0) {
            vm.step = 0;
        }
    };

    vm.finish = function() {
        window.location.reload();
    };

    vm.finishSetup = function() {
        $http({
            method: 'POST',
            url: '/setup',
            data: {
                admin: vm.admin
            }
        }).then(function (res) {
            if (res.data.success) {
                vm.setupDone = true;
            } else {
                vm.setupError = res.data.message;
                vm.setupDone = true;
            }
        }, function (err) {
            console.error(err);
            vm.setupError = 'Server error, failed to finish setup.';
            vm.setupDone = true;
        });
    };
});